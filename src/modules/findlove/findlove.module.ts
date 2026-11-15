import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ConfigModule } from "../../config/config.module.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { PlatformModule } from "../platform/index.js";

import { AdminMembershipController } from "./api/admin-membership.controller.js";
import { FindLoveController } from "./api/findlove.controller.js";
import { AdminMembershipService } from "./application/admin-membership.service.js";
import { FindLoveService } from "./application/findlove.service.js";
import { AdminMembershipRepository } from "./infrastructure/admin-membership.repository.js";
import { FindLoveRepository } from "./infrastructure/findlove.repository.js";

@Module({
  imports: [PrismaModule, PlatformModule, ConfigModule, StorageModule],
  controllers: [FindLoveController, AdminMembershipController],
  providers: [
    AuthGuard,
    RolesGuard,
    FindLoveService,
    FindLoveRepository,
    AdminMembershipService,
    AdminMembershipRepository,
  ],
  exports: [FindLoveService],
})
export class FindLoveModule {}
