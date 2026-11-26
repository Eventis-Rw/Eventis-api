import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";

import { ExpoPushService } from "./expo-push.service.js";

@Module({
  imports: [ConfigModule],
  providers: [ExpoPushService],
  exports: [ExpoPushService],
})
export class PushModule {}
