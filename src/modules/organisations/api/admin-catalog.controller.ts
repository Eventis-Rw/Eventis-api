import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { AdminCatalogService } from "../application/admin-catalog.service.js";
@Controller({ path: "admin/organiser-catalog", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminCatalogController {
  constructor(private readonly catalog: AdminCatalogService) {}
  @Get() read() {
    return this.catalog.read();
  }
  @Put() save(
    @Body() body: unknown,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    if (!actor) throw AppError.unauthenticated();
    return this.catalog.save(body, actor.userId);
  }
}
