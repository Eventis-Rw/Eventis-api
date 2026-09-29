import { Module } from "@nestjs/common";

import { PlatformModule } from "../platform/index.js";

import { EventsController } from "./api/events.controller.js";
import { CreateEventService } from "./application/create-event.service.js";
import { GetEventService } from "./application/get-event.service.js";
import { UpdateEventService } from "./application/update-event.service.js";
import { EventRepository } from "./infrastructure/event.repository.js";

@Module({
  imports: [PlatformModule],
  controllers: [EventsController],
  providers: [
    CreateEventService,
    GetEventService,
    UpdateEventService,
    EventRepository,
  ],
  // Only use-case services leave. The repository stays private to this module.
  exports: [CreateEventService, GetEventService, UpdateEventService],
})
export class EventsModule {}
