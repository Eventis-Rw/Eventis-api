import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { EventRepository } from "../infrastructure/event.repository.js";

/**
 * APPLICATION LAYER — get event use case.
 */
@Injectable()
export class GetEventService {
  constructor(private readonly events: EventRepository) {}

  async execute(id: string) {
    const found = await this.events.findById(id);
    if (!found) throw AppError.notFound("That event");
    return found;
  }
}
