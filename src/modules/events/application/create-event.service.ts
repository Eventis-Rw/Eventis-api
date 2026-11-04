import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import { createEvent, type EventStatus } from "../domain/event.js";
import { EventRepository } from "../infrastructure/event.repository.js";

export interface CreateEventCoverFile {
  filename: string;
  mimetype: string;
  data: Buffer;
}

export interface CreateEventInput {
  title: string;
  description?: string | null | undefined;
  category?: string | null | undefined;
  categoryId?: string | null | undefined;
  location: string;
  city?: string | null | undefined;
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  startDate: Date;
  time: string;
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
  coverFile?: CreateEventCoverFile | undefined;
  posterId: string;
}

@Injectable()
export class CreateEventService {
  constructor(
    private readonly events: EventRepository,
    private readonly storage: StorageService,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateEventInput) {
    if (input.coverFile) {
      this.storage.validateImage(input.coverFile);
    }

    let uploadedCover: string | null = null;
    let persistedCover = false;
    try {
      const draft = createEvent(
        {
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
          coverImage: input.coverFile ? null : (input.coverImage ?? null),
          posterId: input.posterId,
        },
        this.clock.now(),
      );

      const created = await this.events.create(repositoryInput(draft));

      if (input.coverFile) {
        const key = await this.storage.uploadCoverImage(
          created.eventId,
          input.coverFile,
        );
        uploadedCover = key;
        const updated = await this.events.update(created.eventId, {
          ...repositoryInput(created),
          coverImage: key,
        });
        persistedCover = true;
        return updated;
      }

      return created;
    } catch (error) {
      if (uploadedCover && !persistedCover) {
        try {
          await this.storage.deleteFile(uploadedCover);
        } catch {
          // Best-effort cleanup; the original persistence error is more useful.
        }
      }
      if (error instanceof Error && /Invalid (time|date)/.test(error.message)) {
        throw AppError.validation({ _: [error.message] });
      }
      throw error;
    }
  }
}

function repositoryInput(event: ReturnType<typeof createEvent>) {
  return {
    title: event.title,
    description: event.description,
    coverImage: event.coverImage,
    category: event.category,
    categoryId: event.categoryId,
    location: event.location,
    city: event.city,
    latitude: event.latitude,
    longitude: event.longitude,
    startDate: event.startDate,
    time: event.time,
    endDate: event.endDate,
    endTime: event.endTime,
    timezone: event.timezone,
    status: event.status,
    capacity: event.capacity,
    isPaid: event.isPaid,
    priceMinor: event.priceMinor,
    currency: event.currency,
    bookingUrl: event.bookingUrl,
    instructions: event.instructions,
    tags: event.tags,
    organisationId: event.organisationId,
    posterId: event.posterId,
  };
}
