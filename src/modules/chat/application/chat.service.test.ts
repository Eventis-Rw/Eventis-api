import { createHmac } from "node:crypto";
import { expect, test } from "bun:test";

import { ChatService } from "./chat.service.js";

test("call ICE settings issue user-bound, one-hour coturn credentials", () => {
  const now = new Date("2026-11-17T10:00:00.000Z");
  const env = {
    CALL_STUN_URLS: "stun:stun.example.test:3478",
    CALL_TURN_URLS: "turn:turn.example.test:3478?transport=udp,turns:turn.example.test:5349",
    CALL_TURN_SHARED_SECRET: "test-turn-secret",
  } as never;
  const service = new ChatService({} as never, {} as never, {} as never, { now: () => now } as never, {} as never, {} as never, env);
  const result = service.getCallIceServers("user-123");
  const username = `${Math.floor(now.getTime() / 1000) + 3600}:user-123`;
  const credential = createHmac("sha1", "test-turn-secret").update(username).digest("base64");
  expect(result.iceServers).toEqual([
    { urls: ["stun:stun.example.test:3478"] },
    { urls: ["turn:turn.example.test:3478?transport=udp", "turns:turn.example.test:5349"], username, credential },
  ]);
  expect(result.expiresAt).toBe(Math.floor(now.getTime() / 1000) + 3600);
});

test("username directory search strips @, paginates, and scopes requests to the viewer", async () => {
  let searchInput: unknown;
  let rateLimitKey = "";
  const users = {
    searchByUsername: (input: unknown) => {
      searchInput = input;
      return Promise.resolve({ items: [], page: 2, limit: 10, hasMore: true });
    },
  };
  const limiter = { consume: (key: string) => { rateLimitKey = key; } };
  const clock = { now: () => new Date("2026-11-24T10:00:00Z") };
  const service = new ChatService({} as never, users as never, {} as never, clock as never, limiter as never, {} as never, {} as never);
  await expect(service.searchUsers("viewer-id", { query: " @aline ", page: 2, limit: 10 })).resolves.toEqual({ items: [], page: 2, limit: 10, hasMore: true });
  expect(rateLimitKey).toBe("user-search:viewer-id");
  expect(searchInput).toEqual({ query: "aline", viewerId: "viewer-id", page: 2, limit: 10 });
});
