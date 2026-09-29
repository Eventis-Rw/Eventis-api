import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { createEvent } from "../domain/event.js";
import { EventRepository } from "../infrastructure/event.repository.js";

export interface CreateEventInput {
  title: string;
  description?: string | null | undefined;
  startsAt: Date;
  endsAt: Date;
  venueName: string;
  address: string;
}

/**
 * APPLICATION LAYER — create event use case.
 *
 * Orchestrates: applies domain rules, persists via the repository.
 * Knows nothing about HTTP.
 */
@Injectable()
export class CreateEventService {
  constructor(
    private readonly events: EventRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: CreateEventInput) {
    try {
      const draft = createEvent(input, this.clock.now());
      return await this.events.create(draft);
    } catch (error) {
      if (error instanceof Error && /end after it starts/.test(error.message)) {
        throw AppError.validation({ endsAt: [error.message] });
      }
      throw error;
    }
  }
}
