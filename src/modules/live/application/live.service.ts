import { createHash, createHmac } from 'node:crypto';

import {
  ERROR_CODES,
  type LiveDirectory,
  type LiveHeartbeatRequest,
  type LiveStartResult,
  type LiveWatchSession,
  type StartLiveRequest,
} from '@eventis/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../../../common/clock.js';
import { AppError } from '../../../common/errors/app-error.js';
import { ENV, type Env } from '../../../config/env.js';
import {
  claimQueue,
  LIVE_POLICY,
  LiveDirectoryError,
  ownQueue,
  ownRoom,
  pruneDirectory,
  startDirectoryRoom,
  type DirectoryState,
} from '../domain/live-directory.js';
import { LiveDirectoryRepository } from '../infrastructure/live-directory.repository.js';
import {
  toLiveListing,
  toQueue,
  toReservation,
} from '../mappers/live.mapper.js';

@Injectable()
export class LiveService {
  constructor(
    @Inject(LiveDirectoryRepository)
    private readonly repository: LiveDirectoryRepository,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
  ) {}
  private enabled(): void {
    if (
      !this.env.LIVE_DEVELOPMENT_ACCESS ||
      !['development', 'test'].includes(this.env.NODE_ENV)
    )
      throw AppError.forbidden(
        'Live testing is unavailable. Verified hosting access is not connected yet.',
      );
  }
  private proof(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  private token(id: string): string {
    return createHmac('sha256', this.env.JWT_ACCESS_SECRET)
      .update(`eventis-live:${id}`)
      .digest('hex');
  }
  private async change<T>(
    fn: (state: DirectoryState, now: number) => T,
  ): Promise<T> {
    this.enabled();
    try {
      return await this.repository.update((state) => {
        const now = this.clock.nowMs();
        const cleaned = pruneDirectory(state, now);
        return { state: cleaned, value: fn(cleaned, now) };
      });
    } catch (error) {
      if (error instanceof LiveDirectoryError) {
        if (error.reason === 'missing')
          throw new AppError(ERROR_CODES.NOT_FOUND, error.message, 404);
        if (error.reason === 'forbidden')
          throw AppError.forbidden(error.message);
        throw AppError.conflict(
          ERROR_CODES.LIVE_SESSION_CONFLICT,
          error.message,
        );
      }
      if (error instanceof AppError) throw error;
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Live discovery is temporarily unavailable. Try again.',
        503,
      );
    }
  }
  async list(): Promise<LiveDirectory> {
    this.enabled();
    try {
      const state = pruneDirectory(
        await this.repository.read(),
        this.clock.nowMs(),
      );
      return {
        rooms: state.rooms
          .filter((r) => r.live)
          .sort((a, b) => b.listing.startedAt - a.listing.startedAt)
          .map(toLiveListing),
        occupied: state.rooms.length,
        capacity: LIVE_POLICY.capacity,
        queueLength: state.queue.length,
        developmentAccess: true,
        durationMinutes: 30,
        guests: 4,
      };
    } catch {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        'Live discovery is temporarily unavailable. Try again.',
        503,
      );
    }
  }
  start(draft: StartLiveRequest): Promise<LiveStartResult> {
    const token = this.token(draft.requestId);
    return this.change((state, now) => {
      const value = startDirectoryRoom(
        state,
        draft,
        this.proof(token),
        now,
        createHmac('sha256', this.env.JWT_ACCESS_SECRET)
          .update(`room:${draft.requestId}`)
          .digest('hex')
          .slice(0, 32),
      );
      return 'listing' in value
        ? toReservation(value, token)
        : toQueue(value, state, token);
    });
  }
  async watch(id: string): Promise<LiveWatchSession> {
    return this.change((state) => {
      const room = state.rooms.find((r) => r.listing.id === id && r.live);
      if (!room)
        throw new LiveDirectoryError(
          'missing',
          'This Live has ended or is unavailable.',
        );
      return {
        listing: toLiveListing(room),
        roomName: room.roomName,
        hostIdentity: room.hostIdentity,
      };
    });
  }
  heartbeat(
    id: string,
    token: string,
    body: LiveHeartbeatRequest,
  ): Promise<{ ok: true }> {
    return this.change((state, now) => {
      const room = ownRoom(state, id, this.proof(token));
      room.live = body.live;
      room.listing.availableUntil = Math.min(
        now + LIVE_POLICY.leaseMs,
        room.listing.endsAt,
      );
      room.listing.viewers = body.viewers;
      return { ok: true };
    });
  }
  end(id: string, token: string): Promise<{ ok: true }> {
    return this.change((state) => {
      if (state.rooms.some((r) => r.listing.id === id))
        ownRoom(state, id, this.proof(token));
      else if (
        !state.operations.some(
          (o) => o.roomId === id && o.proof === this.proof(token),
        )
      )
        throw new LiveDirectoryError(
          'forbidden',
          'Only the host device can end this Live.',
        );
      state.rooms = state.rooms.filter((r) => r.listing.id !== id);
      return { ok: true };
    });
  }
  queue(
    id: string,
    token: string,
    operation: 'poll' | 'claim' | 'cancel',
  ): Promise<LiveStartResult | { ok: true }> {
    return this.change((state, now) => {
      if (operation === 'claim')
        return toReservation(
          claimQueue(state, id, this.proof(token), now),
          token,
        );
      const ticket = ownQueue(state, id, this.proof(token));
      if (operation === 'cancel') {
        state.queue = state.queue.filter((q) => q.id !== id);
        return { ok: true };
      }
      ticket.expiresAt = now + LIVE_POLICY.queueLeaseMs;
      return toQueue(ticket, state, token);
    });
  }
}
