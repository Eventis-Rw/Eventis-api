import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ConfigModule } from "../../config/config.module.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";

import { OrganisationsController } from "./api/organisations.controller.js";
import { OrganisationsService } from "./application/organisations.service.js";
import { OrganisationRepository } from "./infrastructure/organisation.repository.js";
import { SensitiveDataCipher } from "./infrastructure/sensitive-data.cipher.js";

import { PlatformModule } from "../platform/index.js";

@Module({
  imports: [ConfigModule, PrismaModule, PlatformModule],
  controllers: [OrganisationsController],
  providers: [
    AuthGuard,
    RolesGuard,
    OrganisationsService,
    OrganisationRepository,
    SensitiveDataCipher,
  ],
  exports: [OrganisationsService],
})
export class OrganisationsModule {}
