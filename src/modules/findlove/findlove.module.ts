import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";

import { FindLoveController } from "./api/findlove.controller.js";
import { FindLoveService } from "./application/findlove.service.js";
import { FindLoveRepository } from "./infrastructure/findlove.repository.js";

import { PlatformModule } from "../platform/index.js";

@Module({
  imports: [PrismaModule, PlatformModule],
  controllers: [FindLoveController],
  providers: [AuthGuard, RolesGuard, FindLoveService, FindLoveRepository],
  exports: [FindLoveService],
})
export class FindLoveModule { }
