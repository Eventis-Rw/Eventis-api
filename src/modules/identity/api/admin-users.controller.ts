import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { AppError } from "../../../common/errors/app-error.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import { toProfileResponse } from "../mappers/auth.mapper.js";

const USER_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Controller({ path: "admin/users", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminUsersController {
  constructor(private readonly users: UserRepository) {}

  @Get()
  async list() {
    const users = await this.users.list();
    return { items: users.map(toProfileResponse) };
  }

  @Post(":id/suspend")
  async suspend(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.updateStatus(id, actor, "INACTIVE");
  }

  @Post(":id/activate")
  async activate(
    @Param("id") id: string,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.updateStatus(id, actor, "ACTIVE");
  }

  private async updateStatus(
    id: string,
    actor: AuthenticatedUser | undefined,
    status: "ACTIVE" | "INACTIVE",
  ) {
    if (!actor) throw AppError.unauthenticated();
    if (!USER_ID_REGEX.test(id)) {
      throw AppError.validation({ id: ["id must be a valid UUID"] });
    }
    if (id === actor.userId && status === "INACTIVE") {
      throw AppError.validation({ id: ["An administrator cannot suspend their own account"] });
    }
    return toProfileResponse(await this.users.setStatus(id, status));
  }
}
