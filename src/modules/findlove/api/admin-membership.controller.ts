import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import type { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { ConsoleAccess, Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { AdminMembershipService } from "../application/admin-membership.service.js";
import type { Command } from "../domain/admin-membership.js";

import { adminMembershipEnvelope } from "./admin-membership.dto.js";
@Controller({ path: "admin/findlove-workspace", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@ConsoleAccess("findlove:manage")
@Roles("admin")
export class AdminMembershipController {
  constructor(private readonly membership: AdminMembershipService) {}
  @Get() read() {
    return this.membership.read();
  }
  @Post("commands")
  @HttpCode(200)
  command(
    @Body(zodPipe(adminMembershipEnvelope))
    body: z.infer<typeof adminMembershipEnvelope>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    if (!actor) throw AppError.unauthenticated();
    return this.membership.command(
      { ...body, command: body.command as Command },
      actor.userId,
    );
  }
}
