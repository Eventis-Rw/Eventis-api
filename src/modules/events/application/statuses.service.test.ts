import { rejects } from "node:assert/strict";

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
    const uploadStatusMedia = mock(() =>
      Promise.resolve("https://cdn.example/status.jpg"),
    );
    const create = mock((input: Record<string, unknown>) =>
      Promise.resolve({
        ...input,
        id: "22222222-2222-2222-2222-222222222222",
        organisation: { id: "org-1", name: "Kigali Universe", logoKey: "https://cdn.example/org.jpg" },
        user: {
          organizationName: "My Events",
          firstName: null,
          lastName: null,
          avatarUrl: null,
        },
        _count: { views: 0 },
      }),
    );
    const repository = {
      publishingOrganisation: mock(() => Promise.resolve("org-1")),
      ownsPublishedEvent: mock(() => Promise.resolve(true)),
      create,
    };
    const storage = {
      uploadStatusMedia,
      deleteFile: mock(() => Promise.resolve(undefined)),
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
        organisationId: "org-1",
        userId: ownerId,
        mediaUrl: "https://cdn.example/status.jpg",
        caption: "Tonight ❤️",
        createdAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      }),
    );
    expect(response.user_id).toBe(ownerId);
    expect(response.owner).toEqual({ id: ownerId, name: "Kigali Universe", avatar_url: "https://cdn.example/org.jpg" });
    expect(response.caption).toBe("Tonight ❤️");
    expect(response.expires_at).toBe("2026-10-27T12:00:00.000Z");
  });
  it("rejects an organisation the publisher does not own before uploading media", async () => {
    const repository = { publishingOrganisation: mock(() => Promise.resolve(null)), create: mock() };
    const storage = { uploadStatusMedia: mock() };
    const service = new StatusesService(repository as never, storage as never, { now: () => now } as never);
    await rejects(service.create(ownerId, {
      organisationId: "another-organisation", mediaType: "image", fit: "cover", background: "#000", overlays: [],
      mediaFile: { filename: "story.jpg", mimetype: "image/jpeg", data: Buffer.from("image") },
    }));
    expect(repository.publishingOrganisation).toHaveBeenCalledWith(ownerId, "another-organisation");
    expect(storage.uploadStatusMedia).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe("StatusesService.recordView", () => {
  it("records another member's view and does not count the owner", async () => {
    const statusId = "22222222-2222-2222-2222-222222222222";
    const viewerId = "33333333-3333-3333-3333-333333333333";
    const recordView = mock(() => Promise.resolve(1));
    const countViews = mock(() => Promise.resolve(2));
    const repository = {
      findActiveOwner: mock(() =>
        Promise.resolve({ id: statusId, userId: ownerId }),
      ),
      recordView,
      countViews,
    };
    const service = new StatusesService(
      repository as never,
      { deleteFile: mock(() => Promise.resolve(undefined)) } as never,
      { now: () => now } as never,
    );

    expect(await service.recordView(statusId, viewerId)).toEqual({
      status_id: statusId,
      views_count: 1,
    });
    expect(recordView).toHaveBeenCalledWith(statusId, viewerId, now);

    expect(await service.recordView(statusId, ownerId)).toEqual({
      status_id: statusId,
      views_count: 2,
    });
    expect(recordView).toHaveBeenCalledTimes(1);
    expect(countViews).toHaveBeenCalledWith(statusId);
  });
});

describe("StatusesService.viewers", () => {
  it("returns the viewer list only to the status owner", async () => {
    const statusId = "22222222-2222-2222-2222-222222222222";
    const listViewers = mock(() =>
      Promise.resolve([
        {
          statusId,
          viewerId: "33333333-3333-3333-3333-333333333333",
          viewedAt: new Date("2026-10-26T11:00:00.000Z"),
          viewer: {
            organizationName: null,
            firstName: "Ada",
            lastName: "Mutesi",
            avatarUrl: "https://cdn.example/ada.jpg",
          },
        },
      ]),
    );
    const repository = {
      findActiveOwner: mock(() =>
        Promise.resolve({ id: statusId, userId: ownerId }),
      ),
      listViewers,
    };
    const service = new StatusesService(
      repository as never,
      { deleteFile: mock(() => Promise.resolve(undefined)) } as never,
      { now: () => now } as never,
    );

    await rejects(service.viewers(statusId, "44444444-4444-4444-4444-444444444444"), /not found/i);

    const response = await service.viewers(statusId, ownerId);

    expect(listViewers).toHaveBeenCalledWith(statusId);
    expect(response.views_count).toBe(1);
    expect(response.viewers).toEqual([
      {
        id: "33333333-3333-3333-3333-333333333333",
        name: "Ada Mutesi",
        avatar_url: "https://cdn.example/ada.jpg",
        viewed_at: "2026-10-26T11:00:00.000Z",
      },
    ]);
  });
});
