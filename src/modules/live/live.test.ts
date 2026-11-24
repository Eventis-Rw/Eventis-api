import assert from "node:assert/strict";

import { describe, expect, it, spyOn } from "bun:test";
import { decodeJwt } from "jose";

import { FixedClock } from "../../common/clock.js";
import type { Env } from "../../config/env.js";

import { LiveService } from "./live.service.js";
const now = new Date("2026-11-24T10:00:00Z");
const host = "11111111-1111-4111-8111-111111111111",
  viewer = "22222222-2222-4222-8222-222222222222";
const id = `eventis-live-${host}`;
const listing = {
  id,
  host: { id: host, name: "Real host" },
  title: "Actual room",
  mode: "video",
  startedAt: now.getTime(),
  endsAt: now.getTime() + 1800000,
  availableUntil: now.getTime() + 1800000,
  viewers: 99999,
  chatEnabled: true,
};
function service(configured = true) {
  return new LiveService(
    (configured
      ? {
          LIVEKIT_URL: "wss://test.livekit.cloud",
          LIVEKIT_API_KEY: "api-key",
          LIVEKIT_API_SECRET: "test-secret",
        }
      : {}) as Env,
    {
      user: {
        findUnique: ({ where }: { where: { id: string } }) =>
          Promise.resolve({
            id: where.id,
            status: "ACTIVE",
            deletedAt: null,
            firstName: "Member",
          }),
      },
    } as never,
    new FixedClock(now),
  );
}
describe("real Live directory and media authorization", () => {
  it("returns a true empty directory without seeding fixtures when not configured", async () => {
    const data = await service(false).list();
    expect(data.rooms).toEqual([]);
    expect(data.broadcastingAvailable).toBe(false);
  });
  it("uses real provider participants and omits unopened, expired and unrelated rooms", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        rooms: [
          { name: id, metadata: JSON.stringify(listing), numParticipants: 3 },
          { name: id, metadata: JSON.stringify(listing), numParticipants: 0 },
          { name: "foreign", metadata: "{}", numParticipants: 8 },
        ],
      }),
    );
    try {
      const data = await service().list();
      expect(data.rooms).toHaveLength(1);
      expect(data.rooms[0]?.viewers).toBe(2);
    } finally {
      fetch.mockRestore();
    }
  });
  it("issues subscribe-only viewer tokens and publishes only for the canonical host", async () => {
    const fetch = spyOn(globalThis, "fetch");
    for (let i = 0; i < 4; i++) {
      fetch.mockResolvedValueOnce(
        Response.json({
          rooms: [
            { name: id, metadata: JSON.stringify(listing), numParticipants: 1 },
          ],
        }),
      );
    }
    try {
      const s = service();
      const guest = decodeJwt((await s.token(id, viewer)).participantToken);
      expect(guest.sub).toBe(`viewer-${viewer}`);
      expect((guest.video as { canPublish: boolean }).canPublish).toBe(false);
      const owner = decodeJwt((await s.token(id, host)).participantToken);
      expect((owner.video as { canPublish: boolean }).canPublish).toBe(true);
      await assert.rejects(s.end(id, viewer), { status: 403 });
      await assert.rejects(s.stage(id, viewer, `viewer-${viewer}`, "accept"), {
        status: 403,
      });
    } finally {
      fetch.mockRestore();
    }
  });
  it("refuses fresh tokens to a blocked viewer", async () => {
    const fetch = spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        rooms: [
          {
            name: id,
            metadata: JSON.stringify({ ...listing, blocked: [viewer] }),
          },
        ],
      }),
    );
    try {
      await assert.rejects(service().token(id, viewer), { status: 403 });
    } finally {
      fetch.mockRestore();
    }
  });
});
