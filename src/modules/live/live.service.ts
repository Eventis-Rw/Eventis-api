import { Inject, Injectable } from "@nestjs/common";
import { SignJWT } from "jose";

import { Clock } from "../../common/clock.js";
import { AppError } from "../../common/errors/app-error.js";
import { ENV, type Env } from "../../config/env.js";
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
type Room = { name: string; metadata?: string; numParticipants?: number };
type Listing = {
  id: string;
  host: { id: string; name: string; avatar?: string };
  title: string;
  mode: "video" | "voice";
  startedAt: number;
  endsAt: number;
  availableUntil: number;
  viewers: number;
  chatEnabled: boolean;
  blocked?: string[];
};
@Injectable()
export class LiveService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly db: PrismaService,
    private readonly clock: Clock,
  ) {}
  configured() {
    return !!(
      this.env.LIVEKIT_URL &&
      this.env.LIVEKIT_API_KEY &&
      this.env.LIVEKIT_API_SECRET
    );
  }
  async signed(
    video: Record<string, unknown>,
    identity?: string,
    name?: string,
  ) {
    if (!this.configured())
      throw AppError.forbidden("Live broadcasting is not configured yet.");
    let token = new SignJWT({ video, ...(name ? { name } : {}) })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer(this.env.LIVEKIT_API_KEY!)
      .setIssuedAt()
      .setExpirationTime("5m");
    if (identity) token = token.setSubject(identity);
    return token.sign(new TextEncoder().encode(this.env.LIVEKIT_API_SECRET));
  }
  async call<T>(
    method: string,
    body: Record<string, unknown> = {},
    room?: string,
  ): Promise<T> {
    const token = await this.signed({
      roomList: true,
      roomCreate: true,
      roomAdmin: true,
      ...(room ? { room } : {}),
    });
    const base = this.env
      .LIVEKIT_URL!.replace(/^wss:/, "https:")
      .replace(/\/$/, "");
    const response = await fetch(
      `${base}/twirp/livekit.RoomService/${method}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw new Error(`Live media service unavailable (${response.status})`);
    return response.json() as Promise<T>;
  }
  listing(room: Room): Listing | null {
    if (!room.name.startsWith("eventis-live-")) return null;
    try {
      const value = JSON.parse(room.metadata || "{}") as Listing;
      if (
        value.id !== room.name ||
        !value.host.id ||
        value.endsAt <= this.clock.now().getTime()
      )
        return null;
      return {
        ...value,
        viewers: Math.max(0, (room.numParticipants ?? 0) - 1),
      };
    } catch {
      return null;
    }
  }
  async list() {
    if (!this.configured())
      return {
        rooms: [],
        occupied: 0,
        capacity: 5,
        queueLength: 0,
        developmentAccess: false,
        durationMinutes: 30,
        guests: 4,
        broadcastingAvailable: false,
      };
    const result = await this.call<{ rooms?: Room[] }>("ListRooms");
    const all = (result.rooms ?? [])
      .map((r) => ({
        listing: this.listing(r),
        participants: r.numParticipants ?? 0,
      }))
      .filter((r) => r.listing);
    return {
      rooms: all
        .filter((r) => r.participants > 0)
        .map((r) => {
          const { blocked: _blocked, ...v } = r.listing!;
          return v;
        }),
      occupied: all.length,
      capacity: 5,
      queueLength: 0,
      developmentAccess: false,
      durationMinutes: 30,
      guests: 4,
      broadcastingAvailable: true,
    };
  }
  async room(id: string) {
    const result = await this.call<{ rooms?: Room[] }>("ListRooms", {
      names: [id],
    });
    const listing = result.rooms?.[0] && this.listing(result.rooms[0]);
    if (!listing) throw AppError.notFound("Live broadcast");
    return listing;
  }
  async actor(id: string) {
    const user = await this.db.user.findUnique({ where: { id } });
    if (!user || user.deletedAt || user.status !== "ACTIVE")
      throw AppError.forbidden();
    return user;
  }
  async start(
    userId: string,
    input: { title: string; mode: "video" | "voice"; chatEnabled: boolean },
  ) {
    const user = await this.actor(userId);
    const verified = await this.db.organisation.findFirst({
      where: {
        ownerId: userId,
        verificationStatus: "VERIFIED",
        deletedAt: null,
      },
    });
    const events = await this.db.event.aggregate({
      where: { posterId: userId, status: "published" },
      _count: true,
      _sum: { viewsCount: true },
    });
    if (
      !verified &&
      !(
        user.phoneVerifiedAt &&
        user.createdAt.getTime() + 7 * 86400000 <= this.clock.now().getTime() &&
        events._count > 0 &&
        (events._sum.viewsCount ?? 0) >= 500
      )
    )
      throw AppError.forbidden(
        "Hosting requires a verified organisation or a verified account at least seven days old with a published event and 500 event views.",
      );
    const id = `eventis-live-${userId}`;
    const directory = await this.list();
    const existing = await this.call<{ rooms?: Room[] }>("ListRooms", {
      names: [id],
    });
    let listing = existing.rooms?.[0] && this.listing(existing.rooms[0]);
    if (!listing) {
      if (directory.occupied >= 5) throw AppError.rateLimited(30);
      const now = this.clock.now().getTime();
      listing = {
        id,
        host: {
          id: userId,
          name:
            verified?.name ||
            user.displayName ||
            user.firstName ||
            "Eventis host",
          ...(user.avatarUrl ? { avatar: user.avatarUrl } : {}),
        },
        title: input.title,
        mode: input.mode,
        startedAt: now,
        endsAt: now + 1800000,
        availableUntil: now + 1800000,
        viewers: 0,
        chatEnabled: input.chatEnabled,
      };
      await this.call("CreateRoom", {
        name: id,
        emptyTimeout: 60,
        departureTimeout: 20,
        maxParticipants: 500,
        metadata: JSON.stringify(listing),
      });
    }
    return {
      kind: "room",
      listing,
      roomName: id,
      hostIdentity: `host-${userId}`,
      controlToken: "session",
    };
  }
  async watch(id: string, userId: string) {
    await this.actor(userId);
    const listing = await this.room(id);
    if (listing.blocked?.includes(userId)) throw AppError.forbidden();
    const { blocked: _blocked, ...v } = listing;
    return {
      listing: v,
      roomName: id,
      hostIdentity: `host-${listing.host.id}`,
    };
  }
  async token(id: string, userId: string) {
    const user = await this.actor(userId);
    const listing = await this.room(id);
    if (listing.blocked?.includes(userId)) throw AppError.forbidden();
    const host = listing.host.id === userId;
    return {
      serverUrl: this.env.LIVEKIT_URL,
      participantToken: await this.signed(
        {
          roomJoin: true,
          room: id,
          canSubscribe: true,
          canPublish: host,
          canPublishData: true,
        },
        `${host ? "host" : "viewer"}-${userId}`,
        user.displayName || user.firstName || "Guest",
      ),
    };
  }
  async end(id: string, userId: string) {
    const room = await this.room(id);
    if (room.host.id !== userId) throw AppError.forbidden();
    await this.call("DeleteRoom", { room: id }, id);
    return { ok: true };
  }
  async heartbeat(id: string, userId: string) {
    const room = await this.room(id);
    if (room.host.id !== userId) throw AppError.forbidden();
    return { ok: true };
  }
  async stage(id: string, userId: string, identity: string, action: string) {
    const room = await this.room(id);
    if (room.host.id !== userId) throw AppError.forbidden();
    if (!/^viewer-[0-9a-f-]{36}$/.test(identity))
      throw AppError.validation({ identity: ["Select a viewer"] });
    const allow = action === "accept" || action === "invite";
    if (allow) {
      const people = await this.call<{
        participants?: {
          identity: string;
          permission?: { canPublish?: boolean };
        }[];
      }>("ListParticipants", { room: id }, id);
      if (
        (people.participants ?? []).filter(
          (p) => p.identity.startsWith("viewer-") && p.permission?.canPublish,
        ).length >= 4
      )
        throw AppError.forbidden("The guest stage is full.");
    }
    if (action === "block") {
      room.blocked = [...new Set([...(room.blocked ?? []), identity.slice(7)])];
      await this.call(
        "UpdateRoomMetadata",
        { room: id, metadata: JSON.stringify(room) },
        id,
      );
      await this.call("RemoveParticipant", { room: id, identity }, id);
    } else
      await this.call(
        "UpdateParticipant",
        {
          room: id,
          identity,
          permission: {
            canPublish: allow,
            canSubscribe: true,
            canPublishData: true,
          },
        },
        id,
      );
    return { ok: true };
  }
}
