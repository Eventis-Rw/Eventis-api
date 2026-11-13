import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";

import { AnalyticsController } from "./api/analytics.controller.js";
import { AnalyticsService } from "./application/analytics.service.js";
import { AnalyticsRepository } from "./infrastructure/analytics.repository.js";

import { PlatformModule } from "../platform/index.js";

@Module({
  imports: [PrismaModule, PlatformModule],
  controllers: [AnalyticsController],
  providers: [AuthGuard, RolesGuard, AnalyticsService, AnalyticsRepository],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
