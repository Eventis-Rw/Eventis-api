import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import {
  CurrentUser,
} from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  OptionalAuth,
  Public,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { CreateEventService } from "../application/create-event.service.js";
import { DeleteEventService } from "../application/delete-event.service.js";
import { EventPresentationService } from "../application/event-presentation.service.js";
import { GetEventService } from "../application/get-event.service.js";
import { ListEventsService } from "../application/list-events.service.js";
import { ShareEventService } from "../application/share-event.service.js";
import { UpdateEventService } from "../application/update-event.service.js";
import type { EventResponse } from "../mappers/event.mapper.js";

import { createEventDto, type CreateEventDto } from "./dto/create-event.dto.js";
import { listEventsDto, type ListEventsDto } from "./dto/list-events.dto.js";
import { updateEventDto, type UpdateEventDto } from "./dto/update-event.dto.js";

interface CoverFilePart {
  filename: string;
  mimetype: string;
  data: Buffer;
}

interface ParsedMultipart {
  fields: Record<string, unknown>;
  file?: CoverFilePart;
}

export interface EventListResponse {
  items: EventResponse[];
  page: number;
  limit: number;
  total: number;
}

@Controller({ path: "events", version: ["1", VERSION_NEUTRAL] })
@UseGuards(AuthGuard, RolesGuard)
export class EventsController {
  constructor(
    private readonly createEvent: CreateEventService,
    private readonly getEvent: GetEventService,
    private readonly updateEvent: UpdateEventService,
    private readonly deleteEvent: DeleteEventService,
    private readonly listEvents: ListEventsService,
    private readonly presentation: EventPresentationService,
    private readonly shareEvent: ShareEventService,
  ) {}

  @Post()
  @Roles("organizer_owner")
  async create(
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: unknown,
  ): Promise<EventResponse> {
    if (!user) throw AppError.unauthenticated();

    const { dto, coverFile } = await this.resolveCreatePayload(req, body);
    const event = await this.createEvent.execute({
      title: dto.title,
      description: dto.description,
      category: dto.category,
      location: dto.location,
      startDate: dto.start_date,
      time: dto.time,
      status: dto.status,
      coverImage: null,
      coverFile,
      posterId: user.userId,
    });

    return this.presentation.toResponse(event);
  }

  @Get()
  @Public()
  async list(
    @Query(zodPipe(listEventsDto)) query: ListEventsDto,
  ): Promise<EventListResponse> {
    const result = await this.listEvents.execute({
      page: query.page,
      limit: query.limit,
      category: query.category,
      search: query.search,
      status: query.status,
      includeNonPublished: false,
    });

    return {
      items: result.items.map((event) => this.presentation.toResponse(event)),
      page: query.page,
      limit: query.limit,
      total: result.total,
    };
  }

  @Get(":id/share")
  @Public()
  async share(@Param("id") id: string) {
    return this.shareEvent.execute(id);
  }

  @Get(":id")
  @OptionalAuth()
  async byId(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<EventResponse> {
    const event = await this.getEvent.execute(id, user?.userId);
    return this.presentation.toResponse(event);
  }

  @Put(":id")
  async replace(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: unknown,
  ): Promise<EventResponse> {
    return this.update(id, req, user, body);
  }

  @Patch(":id")
  async patch(
    @Param("id") id: string,
    @Req() req: FastifyRequest,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body() body: unknown,
  ): Promise<EventResponse> {
    return this.update(id, req, user, body);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<void> {
    if (!user) throw AppError.unauthenticated();
    await this.deleteEvent.execute(id, user.userId);
  }

  private async update(
    id: string,
    req: FastifyRequest,
    user: AuthenticatedUser | undefined,
    body: unknown,
  ): Promise<EventResponse> {
    if (!user) throw AppError.unauthenticated();

    const { dto, coverFile } = await this.resolveUpdatePayload(req, body);
    const event = await this.updateEvent.execute(id, user.userId, {
      title: dto.title,
      description: dto.description,
      category: dto.category,
      location: dto.location,
      startDate: dto.start_date,
      time: dto.time,
      status: dto.status,
      coverImage: dto.cover_image,
      coverFile,
    });

    return this.presentation.toResponse(event);
  }

  private async resolveCreatePayload(
    req: FastifyRequest,
    body: unknown,
  ): Promise<{ dto: CreateEventDto; coverFile?: CoverFilePart }> {
    if (isMultipart(req)) {
      const parsed = await parseMultipart(req);
      const dto = zodPipe(createEventDto).transform(parsed.fields);
      return { dto, ...(parsed.file ? { coverFile: parsed.file } : {}) };
    }

    const dto = zodPipe(createEventDto).transform(body);
    return { dto };
  }

  private async resolveUpdatePayload(
    req: FastifyRequest,
    body: unknown,
  ): Promise<{ dto: UpdateEventDto; coverFile?: CoverFilePart }> {
    if (isMultipart(req)) {
      const parsed = await parseMultipart(req);
      const dto = zodPipe(updateEventDto).transform(parsed.fields);
      return { dto, ...(parsed.file ? { coverFile: parsed.file } : {}) };
    }

    const dto = zodPipe(updateEventDto).transform(body);
    return { dto };
  }
}

function isMultipart(req: FastifyRequest): boolean {
  const contentType = req.headers["content-type"] ?? "";
  return contentType.includes("multipart/form-data");
}

async function parseMultipart(req: FastifyRequest): Promise<ParsedMultipart> {
  const fields: Record<string, unknown> = {};
  let file: CoverFilePart | undefined;

  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === "file") {
      const data = await part.toBuffer();
      if (
        part.fieldname === "cover_image" ||
        part.fieldname === "coverImage" ||
        part.fieldname === "cover"
      ) {
        if (file) {
          throw AppError.validation({ cover_image: ["Only one cover image may be uploaded"] });
        }
        file = {
          filename: part.filename,
          mimetype: part.mimetype,
          data,
        };
      }
      continue;
    }

    fields[part.fieldname] = part.value;
  }

  return { fields, ...(file ? { file } : {}) };
}
