import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import type { User } from "../domain/user.js";
import { UserRepository } from "../infrastructure/identity.repository.js";

const USER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class AdminUsersService {
  constructor(private readonly users: UserRepository) {}

  list(): Promise<User[]> {
    return this.users.list();
  }

  async updateStatus(
    id: string,
    actorUserId: string,
    status: "ACTIVE" | "INACTIVE",
  ): Promise<User> {
    if (!USER_ID_REGEX.test(id)) {
      throw AppError.validation({ id: ["id must be a valid UUID"] });
    }
    if (id === actorUserId && status === "INACTIVE") {
      throw AppError.validation({
        id: ["An administrator cannot suspend their own account"],
      });
    }
    return this.users.setStatus(id, status);
  }
}
