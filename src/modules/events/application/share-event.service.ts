import { Inject, Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { ENV, type Env } from "../../../config/env.js";
import { EventRepository } from "../infrastructure/event.repository.js";

export interface EventShareLink {
  event_id: string;
  share_url: string;
}

@Injectable()
export class ShareEventService {
  constructor(
    private readonly events: EventRepository,
    @Inject(ENV) private readonly env: Pick<Env, "MOBILE_APP_SCHEME">,
  ) {}

  async execute(eventId: string): Promise<EventShareLink> {
    if (!UUID_REGEX.test(eventId)) {
      throw AppError.validation({ event_id: ["event_id must be a valid UUID"] });
    }

    const event = await this.events.findById(eventId);
    if (!event || event.status !== "published") {
      throw AppError.notFound("That event");
    }

    return {
      event_id: event.eventId,
      share_url: `${this.env.MOBILE_APP_SCHEME}://event/${encodeURIComponent(event.eventId)}`,
    };
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
