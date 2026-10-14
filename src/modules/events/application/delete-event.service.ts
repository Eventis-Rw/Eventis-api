import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import { EventRepository } from "../infrastructure/event.repository.js";


@Injectable()
export class DeleteEventService {
  constructor(
    private readonly events: EventRepository,
    private readonly storage: StorageService,
  ) {}

  async execute(eventId: string, userId: string): Promise<void> {
    const existing = await this.events.findById(eventId);
    if (!existing) throw AppError.notFound("That event");

    if (existing.posterId !== userId) {
      throw AppError.forbidden(
        "You do not have permission to modify this event",
      );
    }

    await this.events.delete(eventId);
    await this.storage.deleteFile(existing.coverImage);
  }
}
