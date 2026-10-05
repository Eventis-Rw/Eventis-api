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
  location: string;
  startDate: Date;
  time: string;
  status?: EventStatus | undefined;
  /** Optional pre-resolved storage key (ignored when coverFile is provided). */
  coverImage?: string | null | undefined;
  coverFile?: CreateEventCoverFile | undefined;
  /** Bound strictly from the authenticated user — never from the client body. */
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

    try {
      const draft = createEvent(
        {
          title: input.title,
          description: input.description,
          category: input.category,
          location: input.location,
          startDate: input.startDate,
          time: input.time,
          status: input.status,
          coverImage: input.coverFile ? null : (input.coverImage ?? null),
          posterId: input.posterId,
        },
        this.clock.now(),
      );

      const created = await this.events.create({
        title: draft.title,
        description: draft.description,
        coverImage: draft.coverImage,
        category: draft.category,
        location: draft.location,
        startDate: draft.startDate,
        time: draft.time,
        status: draft.status,
        posterId: draft.posterId,
      });

      if (input.coverFile) {
        const key = await this.storage.uploadCoverImage(
          created.eventId,
          input.coverFile,
        );
        return await this.events.update(created.eventId, {
          title: created.title,
          description: created.description,
          coverImage: key,
          category: created.category,
          location: created.location,
          startDate: created.startDate,
          time: created.time,
          status: created.status,
        });
      }

      return created;
    } catch (error) {
      if (error instanceof Error && /Invalid (time|date)/.test(error.message)) {
        throw AppError.validation({ _: [error.message] });
      }
      throw error;
    }
  }
}
