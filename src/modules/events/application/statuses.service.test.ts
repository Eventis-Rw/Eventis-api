import { describe, expect, it, mock } from "bun:test";

import { StatusesService } from "./statuses.service.js";

const ownerId = "11111111-1111-1111-1111-111111111111";
const now = new Date("2026-10-26T12:00:00.000Z");

describe("StatusesService.create", () => {
  it("uploads media and persists the authenticated owner, caption and 24-hour expiry", async () => {
    const file = {
      filename: "story.jpg",
      mimetype: "image/jpeg",
      data: Buffer.from("image"),
    };
    const uploadStatusMedia = mock(
      async () => "https://cdn.example/status.jpg",
    );
    const create = mock(async (input: Record<string, unknown>) => ({
      ...input,
      id: "22222222-2222-2222-2222-222222222222",
      user: {
        organizationName: "My Events",
        firstName: null,
        lastName: null,
        avatarUrl: null,
      },
      _count: { views: 0 },
    }));
    const repository = { ownsPublishedEvent: mock(async () => true), create };
    const storage = {
      uploadStatusMedia,
      deleteFile: mock(async () => undefined),
    };
    const clock = { now: () => now };
    const service = new StatusesService(
      repository as never,
      storage as never,
      clock as never,
    );

    const response = await service.create(ownerId, {
      mediaType: "image",
      caption: "Tonight ❤️",
      fit: "cover",
      background: "#101827",
      overlays: [],
      mediaFile: file,
    });

    expect(uploadStatusMedia).toHaveBeenCalledWith(ownerId, file);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: ownerId,
        mediaUrl: "https://cdn.example/status.jpg",
        caption: "Tonight ❤️",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      }),
    );
    expect(response.user_id).toBe(ownerId);
    expect(response.caption).toBe("Tonight ❤️");
    expect(response.expires_at).toBe("2026-10-27T12:00:00.000Z");
  });
});
