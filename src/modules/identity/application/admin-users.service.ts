import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import { toProfileResponse } from "../mappers/auth.mapper.js";

@Injectable()
export class AdminUsersService {
  constructor(private readonly users: UserRepository, private readonly clock: Clock) {}

  async list() {
    return { items: (await this.users.list()).map(toProfileResponse) };
  }

  async setStatus(id: string, status: "ACTIVE" | "INACTIVE") {
    return toProfileResponse(await this.users.setStatus(id, status, this.clock.now()));
  }
}
