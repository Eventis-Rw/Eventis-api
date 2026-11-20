import { describe, expect, it } from "bun:test";

import type { EventRepository } from "../infrastructure/event.repository.js";

import { ListEventsService } from "./list-events.service.js";

describe("ListEventsService", () => {
  it("limits an organiser's event list to their own events in all statuses", async () => {
    let query: Record<string, unknown> | undefined;
    const repository = {
      list: (input: Record<string, unknown>) => {
        query = input;
        return Promise.resolve({ items: [], total: 0 });
      },
    } as unknown as EventRepository;
    const service = new ListEventsService(repository);

    await service.executeForOwner("poster-123", { page: 2, limit: 25 });

    expect(query).toEqual({
      page: 2,
      limit: 25,
      category: undefined,
      search: undefined,
      posterId: "poster-123",
    });
  });
});
