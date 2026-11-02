import { Global, Module } from "@nestjs/common";

import { PrismaService } from "./prisma.service.js";

/**
 * Prisma is infrastructure. Business modules depend on repositories, and
 * repositories depend on this service — never controllers or domain objects.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
