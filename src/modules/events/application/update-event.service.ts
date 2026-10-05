import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import { applyEventUpdate, type EventStatus } from "../domain/event.js";
import { EventRepository } from "../infrastructure/event.repository.js";

export interface UpdateEventCoverFile {
  filename: string;
  mimetype: string;
  data: Buffer;
}

export interface UpdateEventInput {
  title?: string | undefined;
  description?: string | null | undefined;
  category?: string | null | undefined;
  location?: string | undefined;
  startDate?: Date | undefined;
  time?: string | undefined;
  status?: EventStatus | undefined;
  coverImage?: string | null | undefined;
  coverFile?: UpdateEventCoverFile | undefined;
}


@Injectable()
export class UpdateEventService {
  constructor(
    private readonly events: EventRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(eventId: string, userId: string, input: UpdateEventInput) {
    const existing = await this.events.findById(eventId);
    if (!existing) throw AppError.notFound("That event");

    if (existing.posterId !== userId) {
      throw AppError.forbidden(
        "You do not have permission to modify this event",
      );
    }

    if (input.coverFile) {
      this.storage.validateImage(input.coverFile);
    }

    try {
      let nextCover = input.coverImage;
      if (input.coverFile) {
        nextCover = await this.storage.uploadCoverImage(
          existing.eventId,
          input.coverFile,
        );
      }

      const next = applyEventUpdate(existing, {
        title: input.title,
        description: input.description,
        category: input.category,
        location: input.location,
        startDate: input.startDate,
        time: input.time,
        status: input.status,
        coverImage: nextCover,
      });

      const updated = await this.events.update(eventId, {
        title: next.title,
        description: next.description,
        coverImage: next.coverImage,
        category: next.category,
        location: next.location,
        startDate: next.startDate,
        time: next.time,
        status: next.status,
      });

      if (
        input.coverFile &&
        existing.coverImage &&
        existing.coverImage !== updated.coverImage
      ) {
        await this.storage.deleteFile(existing.coverImage);
      }

      return updated;
    } catch (error) {
      if (
        error instanceof Error &&
        /cannot transition|Invalid (time|date)/.test(error.message)
      ) {
        throw AppError.validation({ _: [error.message] });
      }
      throw error;
    }
  }
}
