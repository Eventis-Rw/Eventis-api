import { Injectable } from "@nestjs/common";

import { UserRepository } from "../infrastructure/identity.repository.js";

export interface PublicUserProfile {
  id: string;
  phone: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

export interface DiscoverableUserProfile {
  id: string;
  username: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}

@Injectable()
export class LookupUsersService {
  constructor(private readonly users: UserRepository) {}

  async byPhones(phones: string[]): Promise<PublicUserProfile[]> {
    const unique = [...new Set(phones)];
    const users = await this.users.findActiveByPhones(unique);
    return users.map(toPublicProfile);
  }

  async byIds(ids: string[]): Promise<PublicUserProfile[]> {
    const unique = [...new Set(ids)];
    const users = await this.users.findActiveByIds(unique);
    return users.map(toPublicProfile);
  }

  async searchByUsername(input: {
    query: string;
    viewerId: string;
    page: number;
    limit: number;
  }): Promise<{ items: DiscoverableUserProfile[]; page: number; limit: number; hasMore: boolean }> {
    const rows = await this.users.searchDiscoverableByUsername({
      query: input.query,
      viewerId: input.viewerId,
      skip: (input.page - 1) * input.limit,
      take: input.limit + 1,
    });
    return {
      items: rows.slice(0, input.limit).map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.displayName,
        firstName: row.firstName,
        lastName: row.lastName,
        avatarUrl: row.avatarUrl,
      })),
      page: input.page,
      limit: input.limit,
      hasMore: rows.length > input.limit,
    };
  }
}

function toPublicProfile(user: {
  id: string;
  phone: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
}): PublicUserProfile {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
  };
}
