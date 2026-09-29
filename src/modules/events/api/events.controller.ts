import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";

import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { CreateEventService } from "../application/create-event.service.js";
import { GetEventService } from "../application/get-event.service.js";
import { UpdateEventService } from "../application/update-event.service.js";
import {
  toEventResponse,
  type EventResponse,
} from "../mappers/event.mapper.js";

import { createEventDto, type CreateEventDto } from "./dto/create-event.dto.js";
import { updateEventDto, type UpdateEventDto } from "./dto/update-event.dto.js";

/**
 * TRANSPORT LAYER. Thin by design: validate, call the use case, map, return.
 *
 * There is no business logic here and there must never be any. This controller
 * may not import anything from infrastructure/ — dependency-cruiser enforces it.
 *
 * Request flow:
 *   POST /api/v1/events
 *     → EventsController
 *     → CreateEventService
 *     → Event domain
 *     → EventRepository
 *     → Prisma
 *     → PostgreSQL
 */
@Controller({ path: "events", version: "1" })
export class EventsController {
  constructor(
    private readonly createEvent: CreateEventService,
    private readonly getEvent: GetEventService,
    private readonly updateEvent: UpdateEventService,
  ) {}

  @Post()
  async create(
    @Body(zodPipe(createEventDto)) body: CreateEventDto,
  ): Promise<EventResponse> {
    return toEventResponse(await this.createEvent.execute(body));
  }

  @Get(":id")
  async byId(@Param("id") id: string): Promise<EventResponse> {
    return toEventResponse(await this.getEvent.execute(id));
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body(zodPipe(updateEventDto)) body: UpdateEventDto,
  ): Promise<EventResponse> {
    return toEventResponse(await this.updateEvent.execute(id, body));
  }
}
