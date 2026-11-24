import { describe, expect, it } from "bun:test";

import type { UserRepository } from "../infrastructure/identity.repository.js";

import { LookupUsersService } from "./lookup-users.service.js";

describe("discoverable username search", () => {
  it("requests one extra public profile for pagination and never returns phone numbers", async () => {
    let query: unknown;
    const repository = {
      searchDiscoverableByUsername: (input: unknown) => {
        query = input;
        return Promise.resolve([
          { id: "u1", username: "aline", displayName: "Aline", firstName: "Aline", lastName: null, avatarUrl: null },
          { id: "u2", username: "aline2", displayName: null, firstName: "Aline", lastName: "Two", avatarUrl: "avatar" },
          { id: "u3", username: "aline3", displayName: null, firstName: "Aline", lastName: "Three", avatarUrl: null },
        ]);
      },
    } as unknown as UserRepository;
    const service = new LookupUsersService(repository);
    const result = await service.searchByUsername({ query: "aline", viewerId: "viewer", page: 2, limit: 2 });
    expect(query).toEqual({ query: "aline", viewerId: "viewer", skip: 2, take: 3 });
    expect(result).toMatchObject({ page: 2, limit: 2, hasMore: true });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).not.toHaveProperty("phone");
  });

  it("preserves missing usernames instead of claiming they are strings", async () => {
    const repository = {
      searchDiscoverableByUsername: () => Promise.resolve([
        { id: "u1", username: null, displayName: "Eden", firstName: null, lastName: null, avatarUrl: null },
      ]),
    } as unknown as UserRepository;
    const result = await new LookupUsersService(repository).searchByUsername({ query: "", viewerId: "viewer", page: 1, limit: 20 });
    expect(result.items[0]).toMatchObject({ username: null, displayName: "Eden" });
  });
});
