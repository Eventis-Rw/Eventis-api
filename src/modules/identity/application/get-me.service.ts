import type { SessionUser } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import { toSessionUser } from "../mappers/auth.mapper.js";

@Injectable()
export class GetMeService {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<SessionUser> {
    const user = await this.users.findById(userId);
    if (!user || user.status !== "ACTIVE") {
      throw AppError.unauthenticated();
    }
    return toSessionUser(user);
  }
}
