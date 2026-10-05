import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { PlatformModule } from "../../modules/platform/index.js";

import { StorageService } from "./storage.service.js";

@Module({
  imports: [ConfigModule, PlatformModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
