import { Module } from "@nestjs/common";

import { ConfigModule } from "../../config/config.module.js";
import { PushModule } from "../../infrastructure/push/push.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { IdentityModule } from "../identity/index.js";
import { PlatformModule } from "../platform/index.js";
import { SettingsModule } from "../settings/index.js";

import { ChatRealtimeGateway } from "./api/chat-realtime.gateway.js";
import { ChatController } from "./api/chat.controller.js";
import { ChatService } from "./application/chat.service.js";
import { ChatRateLimiter } from "./infrastructure/chat-rate-limiter.js";
import { ChatRealtimePublisher } from "./infrastructure/chat-realtime.publisher.js";
import { ChatRepository } from "./infrastructure/chat.repository.js";

@Module({
  imports: [ConfigModule, StorageModule, PlatformModule, IdentityModule, SettingsModule, PushModule],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatRepository,
    ChatRateLimiter,
    ChatRealtimePublisher,
    ChatRealtimeGateway,
  ],
  exports: [ChatService, ChatRealtimePublisher],
})
export class ChatModule {}
