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
