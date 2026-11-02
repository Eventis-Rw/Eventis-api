import { Injectable } from "@nestjs/common";

import { StorageService } from "../../../infrastructure/storage/storage.service.js";
import type { Event } from "../domain/event.js";
import { toEventResponse, type EventResponse } from "../mappers/event.mapper.js";

@Injectable()
export class EventPresentationService {
  constructor(private readonly storage: StorageService) {}

  toResponse(event: Event): EventResponse {
    return toEventResponse(event, this.storage.getPublicUrl(event.coverImage));
  }
}
