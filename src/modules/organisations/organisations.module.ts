import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { ConfigModule } from "../../config/config.module.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { PlatformModule } from "../platform/index.js";

import { AdminCatalogController } from "./api/admin-catalog.controller.js";
import { OrganisationsController } from "./api/organisations.controller.js";
import { AdminCatalogService } from "./application/admin-catalog.service.js";
import { OrganisationsService } from "./application/organisations.service.js";
import { AdminCatalogRepository } from "./infrastructure/admin-catalog.repository.js";
import { OrganisationRepository } from "./infrastructure/organisation.repository.js";
import { SensitiveDataCipher } from "./infrastructure/sensitive-data.cipher.js";

@Module({
  imports: [ConfigModule, PrismaModule, PlatformModule],
  controllers: [OrganisationsController, AdminCatalogController],
  providers: [
    AuthGuard,
    RolesGuard,
    OrganisationsService,
    OrganisationRepository,
    AdminCatalogService,
    AdminCatalogRepository,
    SensitiveDataCipher,
  ],
  exports: [OrganisationsService, AdminCatalogService],
})
export class OrganisationsModule {}
