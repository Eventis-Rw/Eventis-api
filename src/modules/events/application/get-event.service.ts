import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { EventRepository } from "../infrastructure/event.repository.js";


@Injectable()
export class GetEventService {
  constructor(private readonly events: EventRepository) {}

  async execute(eventId: string, viewerUserId?: string | null) {
    const found = await this.events.findById(eventId);
    if (!found) throw AppError.notFound("That event");

    if (found.status !== "published") {
      if (!viewerUserId || found.posterId !== viewerUserId) {
        // Do not leak non-public event existence to non-owners.
        throw AppError.notFound("That event");
      }
      // The owner viewing a non-public event does not inflate public metrics.
      return found;
    }

    return await this.events.incrementViews(eventId);
  }
}
