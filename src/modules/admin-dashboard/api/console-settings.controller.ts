import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import {
  CONSOLE_PERMISSIONS,
  ConsoleAccess,
  Roles,
} from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  Public,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { ConsoleSettingsService } from "../application/console-settings.service.js";

const idSchema = z.uuid();
const roleSchema = z
  .object({
    name: z.string().trim().min(2).max(80),
    permissions: z
      .array(z.enum(CONSOLE_PERMISSIONS))
      .min(1)
      .max(CONSOLE_PERMISSIONS.length),
  })
  .strict();
const settingsSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    supportEmail: z.email().max(254).nullable(),
    announcement: z.string().trim().min(1).max(500).nullable(),
    revision: z.number().int().nonnegative(),
  })
  .strict();
const assignmentSchema = z.object({ roleId: idSchema.nullable() }).strict();

function requireActor(actor: AuthenticatedUser | undefined) {
  if (!actor) throw AppError.unauthenticated();
  return actor;
}

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class ConsoleSettingsController {
  constructor(private readonly settings: ConsoleSettingsService) {}

  @Public()
  @Get("eventis/settings")
  publicSettings() {
    return this.settings.publicSettings();
  }

  @Get("me/console-access")
  access(@CurrentUser() actor: AuthenticatedUser | undefined) {
    const user = requireActor(actor);
    const unrestricted = user.roles.includes("admin");
    return {
      unrestricted,
      permissions: unrestricted
        ? CONSOLE_PERMISSIONS
        : (user.consolePermissions ?? []),
    };
  }

  @Roles("admin")
  @ConsoleAccess("settings:manage")
  @Get("admin/eventis/settings")
  read() {
    return this.settings.read();
  }

  @Roles("admin")
  @ConsoleAccess("settings:manage")
  @Put("admin/eventis/settings")
  save(
    @Body(zodPipe(settingsSchema)) body: z.infer<typeof settingsSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.settings.save(body, requireActor(actor).userId);
  }

  @Roles("admin")
  @Get("admin/console-roles")
  roles() {
    return this.settings.listRoles();
  }

  @Roles("admin")
  @Post("admin/console-roles")
  create(
    @Body(zodPipe(roleSchema)) body: z.infer<typeof roleSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.settings.saveRole(null, body, requireActor(actor).userId);
  }

  @Roles("admin")
  @Put("admin/console-roles/:id")
  update(
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(roleSchema)) body: z.infer<typeof roleSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.settings.saveRole(id, body, requireActor(actor).userId);
  }

  @Roles("admin")
  @Delete("admin/console-roles/:id")
  remove(
    @Param("id", zodPipe(idSchema)) id: string,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.settings.deleteRole(id, requireActor(actor).userId);
  }

  @Roles("admin")
  @Put("admin/console-roles/assignments/:id")
  assign(
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(assignmentSchema)) body: z.infer<typeof assignmentSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.settings.assign(id, body.roleId, requireActor(actor).userId);
  }
}
