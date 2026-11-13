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
  categoryId?: string | null | undefined;
  location?: string | undefined;
  city?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  startDate?: Date | undefined;
  time?: string | undefined;
  endDate?: Date | null | undefined;
  endTime?: string | null | undefined;
  timezone?: string | undefined;
  status?: EventStatus | undefined;
  capacity?: number | null | undefined;
  isPaid?: boolean | undefined;
  priceMinor?: bigint | null | undefined;
  currency?: string | undefined;
  bookingUrl?: string | null | undefined;
  instructions?: string | null | undefined;
  tags?: string[] | undefined;
  organisationId?: string | null | undefined;
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

    let uploadedCover: string | null = null;
    let persistedCover = false;
    try {
      let nextCover = input.coverImage;
      if (input.coverFile) {
        nextCover = await this.storage.uploadCoverImage(
          existing.eventId,
          input.coverFile,
        );
        uploadedCover = nextCover;
      }

      const next = applyEventUpdate(existing, {
        title: input.title,
        description: input.description,
        category: input.category,
        categoryId: input.categoryId,
        location: input.location,
        city: input.city,
        latitude: input.latitude,
        longitude: input.longitude,
        startDate: input.startDate,
        time: input.time,
        endDate: input.endDate,
        endTime: input.endTime,
        timezone: input.timezone,
        status: input.status,
        capacity: input.capacity,
        isPaid: input.isPaid,
        priceMinor: input.priceMinor,
        currency: input.currency,
        bookingUrl: input.bookingUrl,
        instructions: input.instructions,
        tags: input.tags,
        organisationId: input.organisationId,
        coverImage: nextCover,
      });

      const updated = await this.events.update(eventId, {
        title: next.title,
        description: next.description,
        coverImage: next.coverImage,
        category: next.category,
        categoryId: next.categoryId,
        location: next.location,
        city: next.city,
        latitude: next.latitude,
        longitude: next.longitude,
        startDate: next.startDate,
        time: next.time,
        endDate: next.endDate,
        endTime: next.endTime,
        timezone: next.timezone,
        status: next.status,
        capacity: next.capacity,
        isPaid: next.isPaid,
        priceMinor: next.priceMinor,
        currency: next.currency,
        bookingUrl: next.bookingUrl,
        instructions: next.instructions,
        tags: next.tags,
        organisationId: next.organisationId,
      });
      persistedCover = true;

      if (
        input.coverFile &&
        existing.coverImage &&
        existing.coverImage !== updated.coverImage
      ) {
        await this.storage.deleteFile(existing.coverImage);
      }

      return updated;
    } catch (error) {
      if (uploadedCover && !persistedCover) {
        try {
          await this.storage.deleteFile(uploadedCover);
        } catch {
          // Preserve the original database or upload error.
        }
      }
      if (
        error instanceof Error &&
        /cannot transition|Invalid (time|date)|End date|Paid events|price/.test(
          error.message,
        )
      ) {
        throw AppError.validation({ _: [error.message] });
      }
      throw error;
    }
  }
}
