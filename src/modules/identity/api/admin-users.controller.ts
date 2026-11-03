import { Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { AdminUsersService } from "../application/admin-users.service.js";
import { toProfileResponse } from "../mappers/auth.mapper.js";

@Controller({ path: "admin/users", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

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
    return toProfileResponse(
      await this.users.updateStatus(id, actor.userId, status),
    );
  }
}
