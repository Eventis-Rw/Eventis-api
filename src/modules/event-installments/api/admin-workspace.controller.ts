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
import { AdminWorkspaceService } from "../application/admin-workspace.service.js";
import type { Command } from "../domain/admin-workspace.types.js";

import { adminInstallmentEnvelope } from "./admin-workspace.dto.js";
@Controller({ path: "admin/installment-workspace", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@ConsoleAccess("installments:manage")
@Roles("admin")
export class AdminWorkspaceController {
  constructor(private readonly workspace: AdminWorkspaceService) {}
  @Get() read() {
    return this.workspace.read();
  }
  @Post("commands")
  @HttpCode(200)
  command(
    @Body(zodPipe(adminInstallmentEnvelope))
    body: z.infer<typeof adminInstallmentEnvelope>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    if (!actor) throw AppError.unauthenticated();
    return this.workspace.command(
      { ...body, command: body.command as Command },
      actor.userId,
    );
  }
}
