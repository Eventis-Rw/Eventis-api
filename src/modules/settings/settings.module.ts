import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { EmailModule } from "../../infrastructure/email/email.module.js";
import { IdentityModule } from "../identity/index.js";
import { PlatformModule } from "../platform/index.js";

import { SettingsController } from "./api/settings.controller.js";
import { PushDeliveryService } from "./application/push-delivery.service.js";
import { SettingsService } from "./application/settings.service.js";
import { SettingsRepository } from "./infrastructure/settings.repository.js";


@Module({
  imports: [PrismaModule, IdentityModule, PlatformModule, EmailModule],
  controllers: [SettingsController],
  providers: [
    AuthGuard,
    RolesGuard,
    SettingsService,
    SettingsRepository,
    PushDeliveryService,
  ],
  exports: [SettingsService],
})
export class SettingsModule {}
