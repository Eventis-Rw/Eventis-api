import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { PlatformModule } from "../platform/index.js";

import { AdminDashboardController } from "./api/admin-dashboard.controller.js";
import { AdminDashboardService } from "./application/admin-dashboard.service.js";
import { AdminDashboardRepository } from "./infrastructure/admin-dashboard.repository.js";
import { ConsoleSettingsController } from "./api/console-settings.controller.js";
import { ConsoleSettingsService } from "./application/console-settings.service.js";
import { ConsoleSettingsRepository } from "./infrastructure/console-settings.repository.js";

@Module({
  imports: [PrismaModule, StorageModule, PlatformModule],
  controllers: [AdminDashboardController, ConsoleSettingsController],
  providers: [
    AuthGuard,
    RolesGuard,
    AdminDashboardRepository,
    ConsoleSettingsRepository,
    ConsoleSettingsService,
    AdminDashboardService,
  ],
})
export class AdminDashboardModule {}
