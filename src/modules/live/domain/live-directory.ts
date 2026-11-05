import type { LiveListing, StartLiveRequest } from '@eventis/contracts';

export const LIVE_POLICY = {
  capacity: 5,
  durationMs: 30 * 60_000,
  leaseMs: 60_000,
  queueLeaseMs: 90_000,
  maxQueue: 100,
} as const;
export class LiveDirectoryError extends Error {
  constructor(
    readonly reason: 'missing' | 'forbidden' | 'conflict' | 'full',
    message: string,
  ) {
    super(message);
  }
}
export interface StoredRoom {
  listing: LiveListing;
  accountId: string;
  requestId: string;
  roomName: string;
  hostIdentity: string;
  proof: string;
  live: boolean;
}
export interface StoredQueue {
  id: string;
  draft: StartLiveRequest;
  proof: string;
  expiresAt: number;
}
export interface DirectoryState {
  rooms: StoredRoom[];
  queue: StoredQueue[];
  operations: { id: string; roomId: string; proof: string; at: number }[];
}
export const emptyDirectory = (): DirectoryState => ({
  rooms: [],
  queue: [],
  operations: [],
});
export function pruneDirectory(
  state: DirectoryState,
  now: number,
): DirectoryState {
  return {
    rooms: state.rooms.filter(
      (r) => r.listing.endsAt > now && r.listing.availableUntil > now,
    ),
    queue: state.queue.filter((q) => q.expiresAt > now),
    operations: state.operations.filter((o) => o.at > now - 86400000),
  };
}
function reserve(
  state: DirectoryState,
  draft: StartLiveRequest,
  proof: string,
  now: number,
  publicId: string,
): StoredRoom {
  const roomName = `ev1-${draft.mode === 'video' ? 'v' : 'a'}-${publicId}`;
  const hostIdentity = `host-${roomName.slice(6)}`;
  const room: StoredRoom = {
    accountId: draft.host.id,
    requestId: draft.requestId,
    roomName,
    hostIdentity,
    proof,
    live: false,
    listing: {
      id: publicId,
      host: { ...draft.host },
      title: draft.title,
      mode: draft.mode,
      ...(draft.event ? { event: draft.event } : {}),
      chatEnabled: draft.chatEnabled,
      startedAt: now,
      endsAt: now + LIVE_POLICY.durationMs,
      availableUntil: now + LIVE_POLICY.leaseMs,
      viewers: 0,
    },
  };
  state.rooms.push(room);
  return room;
}
export function startDirectoryRoom(
  state: DirectoryState,
  draft: StartLiveRequest,
  proof: string,
  now: number,
  publicId: string,
): StoredRoom | StoredQueue {
  const existing =
    state.rooms.find((r) => r.requestId === draft.requestId) ??
    state.queue.find((q) => q.draft.requestId === draft.requestId);
  if (existing) {
    if (existing.proof !== proof)
      throw new LiveDirectoryError(
        'forbidden',
        'This session belongs to another device.',
      );
    return existing;
  }
  if (state.operations.some((o) => o.id === draft.requestId))
    throw new LiveDirectoryError(
      'conflict',
      'That session has finished. Start a new Live.',
    );
  if (
    state.rooms.some((r) => r.accountId === draft.host.id) ||
    state.queue.some((q) => q.draft.host.id === draft.host.id)
  )
    throw new LiveDirectoryError(
      'conflict',
      'You already have an active Live or a place in the queue.',
    );
  if (state.operations.length >= 10000)
    throw new LiveDirectoryError('full', 'Live is busy. Try again later.');
  state.operations.push({
    id: draft.requestId,
    roomId: publicId,
    proof,
    at: now,
  });
  if (state.rooms.length >= LIVE_POLICY.capacity || state.queue.length) {
    if (state.queue.length >= LIVE_POLICY.maxQueue)
      throw new LiveDirectoryError(
        'full',
        'The Live waiting queue is full. Try again later.',
      );
    const ticket: StoredQueue = {
      id: publicId,
      draft,
      proof,
      expiresAt: now + LIVE_POLICY.queueLeaseMs,
    };
    state.queue.push(ticket);
    return ticket;
  }
  return reserve(state, draft, proof, now, publicId);
}
export function ownRoom(
  state: DirectoryState,
  id: string,
  proof: string,
): StoredRoom {
  const room = state.rooms.find((r) => r.listing.id === id);
  if (!room)
    throw new LiveDirectoryError(
      'missing',
      'This Live has ended or is unavailable.',
    );
  if (room.proof !== proof)
    throw new LiveDirectoryError(
      'forbidden',
      'Only the host device can change this Live.',
    );
  return room;
}
export function ownQueue(
  state: DirectoryState,
  id: string,
  proof: string,
): StoredQueue {
  const ticket = state.queue.find((q) => q.id === id);
  if (!ticket)
    throw new LiveDirectoryError(
      'missing',
      'Your queue place has expired. Join again when ready.',
    );
  if (ticket.proof !== proof)
    throw new LiveDirectoryError(
      'forbidden',
      'This queue place belongs to another device.',
    );
  return ticket;
}
export function claimQueue(
  state: DirectoryState,
  id: string,
  proof: string,
  now: number,
): StoredRoom {
  const existing = state.rooms.find((r) => r.listing.id === id);
  if (existing) return ownRoom(state, id, proof);
  const ticket = ownQueue(state, id, proof);
  if (state.queue[0]?.id !== id || state.rooms.length >= LIVE_POLICY.capacity)
    throw new LiveDirectoryError(
      'conflict',
      'Wait for your place and a free Live slot.',
    );
  state.queue = state.queue.filter((q) => q.id !== id);
  return reserve(state, ticket.draft, proof, now, ticket.id);
}
