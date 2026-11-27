import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { ChatModule } from "../chat/index.js";
import { PlatformModule } from "../platform/index.js";

import { AdminDashboardController } from "./api/admin-dashboard.controller.js";
import { ChatManagementController } from "./api/chat-management.controller.js";
import { ConsoleSettingsController } from "./api/console-settings.controller.js";
import { AdminDashboardService } from "./application/admin-dashboard.service.js";
import { ChatManagementService } from "./application/chat-management.service.js";
import { ConsoleSettingsService } from "./application/console-settings.service.js";
import { AdminDashboardRepository } from "./infrastructure/admin-dashboard.repository.js";
import { ConsoleSettingsRepository } from "./infrastructure/console-settings.repository.js";

@Module({
  imports: [PrismaModule, StorageModule, PlatformModule, ChatModule],
  controllers: [AdminDashboardController, ConsoleSettingsController, ChatManagementController],
  providers: [
    AuthGuard,
    RolesGuard,
    AdminDashboardRepository,
    ConsoleSettingsRepository,
    ConsoleSettingsService,
    AdminDashboardService,
    ChatManagementService,
  ],
})
export class AdminDashboardModule {}
