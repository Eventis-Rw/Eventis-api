import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { IdentityModule } from "../identity/index.js";

import { SettingsController } from "./api/settings.controller.js";
import { SettingsService } from "./application/settings.service.js";
import { SettingsRepository } from "./infrastructure/settings.repository.js";

import { PlatformModule } from "../platform/index.js";

@Module({
  imports: [PrismaModule, IdentityModule, PlatformModule],
  controllers: [SettingsController],
  providers: [
    AuthGuard,
    RolesGuard,
    SettingsService,
    SettingsRepository,
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
