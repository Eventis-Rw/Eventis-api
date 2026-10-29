import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {} from "@fastify/multipart";
import { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { StatusesService } from "../application/statuses.service.js";
import { createStatusSchema } from "./statuses.schema.js";

const UUID = z.string().uuid();

@Controller({ path: "statuses", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class StatusesController {
  constructor(private readonly statuses: StatusesService) {}

  @Post("media")
  @Roles("organizer_owner")
  async uploadMedia(
    @Req() req: FastifyRequest,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ) {
    const user = requireUser(currentUser);
    let mediaUrl: string | undefined;
    for await (const part of req.parts()) {
      if (part.type !== "file" || part.fieldname !== "media") continue;
      if (mediaUrl)
        throw AppError.validation({
          media: ["Upload one image or video at a time"],
        });
      mediaUrl = await this.statuses.uploadMedia(user.userId, {
        filename: part.filename,
        mimetype: part.mimetype,
        data: await part.toBuffer(),
      });
    }
    if (!mediaUrl)
      throw AppError.validation({
        media: ["Choose an image or video using the media field"],
      });
    return { media_url: mediaUrl };
  }

  @Post()
  @Roles("organizer_owner")
  async create(
    @Req() req: FastifyRequest,
    @Body() body: unknown,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ) {
    const user = requireUser(currentUser);
    const { fields, mediaFile } = await resolveCreateStatusBody(req, body);
    const input = zodPipe(createStatusSchema).transform(fields);
    return this.statuses.create(user.userId, {
      eventId: input.event_id,
      mediaUrl: input.media_url,
      mediaType: input.media_type,
      caption: input.caption,
      fit: input.fit,
      background: input.background,
      overlays: input.overlays,
      mediaFile,
    });
  }

  @Get("feed")
  feed(@CurrentUser() currentUser?: AuthenticatedUser) {
    return this.statuses.feed(requireUser(currentUser).userId);
  }

  @Get("me")
  mine(@CurrentUser() currentUser?: AuthenticatedUser) {
    return this.statuses.mine(requireUser(currentUser).userId);
  }

  @Get(":id")
  byId(
    @Param("id") id: string,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ) {
    requireUser(currentUser);
    return this.statuses.byId(parseId(id));
  }

  @Post(":id/views")
  recordView(
    @Param("id") id: string,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ) {
    return this.statuses.recordView(
      parseId(id),
      requireUser(currentUser).userId,
    );
  }

  @Delete(":id")
  async remove(
    @Param("id") id: string,
    @CurrentUser() currentUser?: AuthenticatedUser,
  ): Promise<void> {
    await this.statuses.delete(parseId(id), requireUser(currentUser).userId);
  }
}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}

function parseId(id: string): string {
  const parsed = UUID.safeParse(id);
  if (!parsed.success)
    throw AppError.validation({ id: ["id must be a valid UUID"] });
  return parsed.data;
}

interface StatusMediaFile {
  filename: string;
  mimetype: string;
  data: Buffer;
}

async function resolveCreateStatusBody(
  req: FastifyRequest,
  body: unknown,
): Promise<{ fields: unknown; mediaFile?: StatusMediaFile }> {
  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data"))
    return { fields: body };

  const fields: Record<string, unknown> = {};
  let mediaFile: StatusMediaFile | undefined;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (part.fieldname !== "media")
        throw AppError.validation({
          media: ["Upload the file using the media field"],
        });
      if (mediaFile)
        throw AppError.validation({
          media: ["Upload one image or video at a time"],
        });
      mediaFile = {
        filename: part.filename,
        mimetype: part.mimetype,
        data: await part.toBuffer(),
      };
      continue;
    }
    if (part.fieldname === "overlays" && typeof part.value === "string") {
      if (!part.value.trim()) {
        fields.overlays = [];
        continue;
      }
      try {
        fields.overlays = JSON.parse(part.value) as unknown;
      } catch {
        throw AppError.validation({
          overlays: ["overlays must be a valid JSON array"],
        });
      }
      continue;
    }
    if (part.value === "") continue;
    fields[part.fieldname] = part.value;
  }
  return { fields, ...(mediaFile ? { mediaFile } : {}) };
}
