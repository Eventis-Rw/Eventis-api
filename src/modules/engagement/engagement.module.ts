import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { PlatformModule } from "../platform/index.js";

import { EngagementController } from "./api/engagement.controller.js";
import { EngagementService } from "./application/engagement.service.js";
import { EngagementRepository } from "./infrastructure/engagement.repository.js";

@Module({
  imports: [PrismaModule, PlatformModule],
  controllers: [EngagementController],
  providers: [
    AuthGuard,
    RolesGuard,
    EngagementService,
    EngagementRepository,
  ],
  exports: [EngagementService],
})
export class EngagementModule {}
