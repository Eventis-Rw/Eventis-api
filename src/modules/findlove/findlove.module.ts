import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ConfigModule } from "../../config/config.module.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";

import { FindLoveController } from "./api/findlove.controller.js";
import { FindLoveChatService } from "./application/findlove-chat.service.js";
import { FindLoveNotificationService } from "./application/findlove-notification.service.js";
import { FindLoveService } from "./application/findlove.service.js";
import { FindLoveChatRepository } from "./infrastructure/findlove-chat.repository.js";
import { FindLoveNotificationRepository } from "./infrastructure/findlove-notification.repository.js";
import { FindLoveRepository } from "./infrastructure/findlove.repository.js";

import { PlatformModule } from "../platform/index.js";

@Module({
  imports: [PrismaModule, PlatformModule, ConfigModule, StorageModule],
  controllers: [FindLoveController],
  providers: [
    AuthGuard,
    RolesGuard,
    FindLoveService,
    FindLoveRepository,
    FindLoveChatService,
    FindLoveChatRepository,
    FindLoveNotificationService,
    FindLoveNotificationRepository,
  ],
  exports: [FindLoveService],
})
export class FindLoveModule { }
