import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import type { LoveProfileType } from "../domain/user.js";
import { UserRepository } from "../infrastructure/identity.repository.js";

@Injectable()
export class AccountTypeService {
  constructor(private readonly users: UserRepository) {}

  async getFindLoveProfileType(userId: string): Promise<LoveProfileType> {
    const user = await this.users.findById(userId);
    if (!user) throw AppError.notFound("User");
    return user.findLoveProfileType;
  }

  async setFindLoveProfileType(
    userId: string,
    profileType: LoveProfileType,
  ): Promise<LoveProfileType> {
    const user = await this.users.setFindLoveProfileType(userId, profileType);
    return user.findLoveProfileType;
  }
}
