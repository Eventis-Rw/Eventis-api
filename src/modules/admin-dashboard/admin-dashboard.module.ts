import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { PlatformModule } from "../platform/index.js";

import { AdminDashboardController } from "./api/admin-dashboard.controller.js";
import { AdminDashboardService } from "./application/admin-dashboard.service.js";
import { AdminDashboardRepository } from "./infrastructure/admin-dashboard.repository.js";
@Module({
  imports: [PrismaModule, StorageModule, PlatformModule],
  controllers: [AdminDashboardController],
  providers: [
    AuthGuard,
    RolesGuard,
    AdminDashboardRepository,
    AdminDashboardService,
  ],
})
export class AdminDashboardModule {}
