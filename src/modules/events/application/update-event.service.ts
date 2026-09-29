import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { applyEventUpdate, type EventStatus } from "../domain/event.js";
import { EventRepository } from "../infrastructure/event.repository.js";

export interface UpdateEventInput {
  title?: string | undefined;
  description?: string | null | undefined;
  status?: EventStatus | undefined;
  startsAt?: Date | undefined;
  endsAt?: Date | undefined;
  venueName?: string | undefined;
  address?: string | undefined;
}

/**
 * APPLICATION LAYER — update event use case.
 */
@Injectable()
export class UpdateEventService {
  constructor(private readonly events: EventRepository) {}

  async execute(id: string, input: UpdateEventInput) {
    const existing = await this.events.findById(id);
    if (!existing) throw AppError.notFound("That event");

    try {
      const next = applyEventUpdate(existing, input);
      return await this.events.update(id, {
        title: next.title,
        description: next.description,
        status: next.status,
        startsAt: next.startsAt,
        endsAt: next.endsAt,
        venueName: next.venueName,
        address: next.address,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        /end after it starts|cannot transition/.test(error.message)
      ) {
        throw AppError.validation({ _: [error.message] });
      }
      throw error;
    }
  }
}
