import { Module } from "@nestjs/common";

import { AuthGuard } from "../../common/guards/auth.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { PlatformModule } from "../platform/index.js";

import { EventsController } from "./api/events.controller.js";
import { StatusesController } from "./api/statuses.controller.js";
import { CreateEventService } from "./application/create-event.service.js";
import { DeleteEventService } from "./application/delete-event.service.js";
import { EventPresentationService } from "./application/event-presentation.service.js";
import { GetEventService } from "./application/get-event.service.js";
import { ListEventsService } from "./application/list-events.service.js";
import { ShareEventService } from "./application/share-event.service.js";
import { StatusesService } from "./application/statuses.service.js";
import { UpdateEventService } from "./application/update-event.service.js";
import { EventRepository } from "./infrastructure/event.repository.js";
import { StatusRepository } from "./infrastructure/status.repository.js";

@Module({
  imports: [PlatformModule, StorageModule, PrismaModule],
  controllers: [EventsController, StatusesController],
  providers: [
    AuthGuard,
    RolesGuard,
    CreateEventService,
    GetEventService,
    UpdateEventService,
    DeleteEventService,
    EventPresentationService,
    ListEventsService,
    ShareEventService,
    StatusesService,
    EventRepository,
    StatusRepository,
  ],

  exports: [
    CreateEventService,
    GetEventService,
    UpdateEventService,
    DeleteEventService,
    ListEventsService,
  ],
})
export class EventsModule {}
