import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import { StatusRepository, type StatusRecord } from "../infrastructure/status.repository.js";

export interface CreateStatusInput {
  eventId?: string | undefined;
  mediaUrl?: string | undefined;
  mediaType: "image" | "video" | "text";
  caption?: string | undefined;
  fit: "cover" | "contain";
  background: string;
  overlays: unknown;
  mediaFile?: { filename: string; mimetype: string; data: Buffer } | undefined;
}

@Injectable()
export class StatusesService {
  constructor(private readonly statuses: StatusRepository, private readonly storage: StorageService, private readonly clock: Clock) {}

  uploadMedia(userId: string, file: { filename: string; mimetype: string; data: Buffer }): Promise<string> {
    return this.storage.uploadStatusMedia(userId, file);
  }

  async create(userId: string, input: CreateStatusInput) {
    if (input.eventId && !(await this.statuses.ownsPublishedEvent(input.eventId, userId))) {
      throw AppError.validation({ event_id: ["Choose one of your published events"] });
    }
    if ((input.mediaType === "image" || input.mediaType === "video") && !input.mediaUrl && !input.mediaFile) {
      throw AppError.validation({ media: ["Upload a media file or provide media_url"] });
    }
    if (input.mediaUrl && input.mediaFile) {
      throw AppError.validation({ media: ["Provide either a media file or media_url, not both"] });
    }
    if (input.mediaFile && input.mediaType === "text") {
      throw AppError.validation({ media_type: ["Text statuses cannot include an image or video file"] });
    }
    if (input.mediaFile && input.mediaType === "image" && !input.mediaFile.mimetype.startsWith("image/")) {
      throw AppError.validation({ media_type: ["Choose media_type video for a video file"] });
    }
    if (input.mediaFile && input.mediaType === "video" && !input.mediaFile.mimetype.startsWith("video/")) {
      throw AppError.validation({ media_type: ["Choose media_type image for an image file"] });
    }

    let uploadedMediaUrl: string | undefined;
    try {
      uploadedMediaUrl = input.mediaFile ? await this.uploadMedia(userId, input.mediaFile) : undefined;
      const now = this.clock.now();
      const row = await this.statuses.create({
        userId, eventId: input.eventId ?? null, mediaUrl: uploadedMediaUrl ?? input.mediaUrl ?? null,
        mediaType: input.mediaType, caption: input.caption ?? null, fit: input.fit,
        background: input.background, overlays: input.overlays,
        createdAt: now, expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
      return this.toResponse(row);
    } catch (error) {
      if (uploadedMediaUrl) await this.storage.deleteFile(uploadedMediaUrl).catch(() => undefined);
      throw error;
    }
  }

  async feed(userId: string) {
    return (await this.statuses.listFeed(userId, this.clock.now())).map((row) => this.toResponse(row));
  }

  async mine(userId: string) {
    return (await this.statuses.listMine(userId, this.clock.now())).map((row) => this.toResponse(row));
  }

  async byId(id: string) {
    const row = await this.statuses.findActive(id, this.clock.now());
    if (!row) throw AppError.notFound("That status");
    return this.toResponse(row);
  }

  async recordView(id: string, viewerId: string) {
    const status = await this.statuses.findActiveOwner(id, this.clock.now());
    if (!status) throw AppError.notFound("That status");
    const viewsCount = status.userId === viewerId
      ? await this.statuses.countViews(status.id)
      : await this.statuses.recordView(status.id, viewerId, this.clock.now());
    return { status_id: status.id, views_count: viewsCount };
  }

  async delete(id: string, userId: string): Promise<void> {
    const row = await this.statuses.findOwned(id, userId);
    if (!row) throw AppError.notFound("That status");
    await this.statuses.delete(row.id);
    await this.storage.deleteFile(row.mediaUrl);
  }

  private toResponse(row: StatusRecord) {
    return {
      id: row.id, user_id: row.userId, event_id: row.eventId, media_url: row.mediaUrl,
      media_type: row.mediaType, caption: row.caption, fit: row.fit, background: row.background,
      overlays: row.overlays, created_at: row.createdAt.toISOString(), expires_at: row.expiresAt.toISOString(),
      views_count: row._count.views,
      owner: {
        id: row.userId,
        name: row.user.organizationName ?? ([row.user.firstName, row.user.lastName].filter(Boolean).join(" ") || "Event organiser"),
        avatar_url: row.user.avatarUrl,
      },
    };
  }
}
