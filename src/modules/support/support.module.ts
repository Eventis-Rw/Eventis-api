import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";

import { SupportController } from "./api/support.controller.js";
import { SupportService } from "./application/support.service.js";
import { SupportRepository } from "./infrastructure/support.repository.js";

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [SupportController],
  providers: [AuthGuard, RolesGuard, SupportService, SupportRepository],
  exports: [SupportService],
})
export class SupportModule {}
