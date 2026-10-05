import { Injectable } from "@nestjs/common";

import type { EventStatus } from "../domain/event.js";
import { EventRepository } from "../infrastructure/event.repository.js";

export interface ListEventsInput {
  page: number;
  limit: number;
  category?: string | undefined;
  search?: string | undefined;
  status?: EventStatus | undefined;
  includeNonPublished?: boolean | undefined;
}

@Injectable()
export class ListEventsService {
  constructor(private readonly events: EventRepository) {}

  async execute(input: ListEventsInput) {
    const status =
      input.includeNonPublished && input.status
        ? input.status
        : ("published" as const);

    return this.events.list({
      page: input.page,
      limit: input.limit,
      category: input.category,
      search: input.search,
      status,
    });
  }
}
