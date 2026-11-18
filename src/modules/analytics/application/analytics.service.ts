import { Injectable } from "@nestjs/common";
import type { AnalyticsEventType } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { AnalyticsRepository } from "../infrastructure/analytics.repository.js";

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly analytics: AnalyticsRepository,
    private readonly clock: Clock,
  ) {}

  async record(
    eventId: string,
    input: {
      userId: string | null;
      type: AnalyticsEventType;
      source?: string | null | undefined;
    },
  ) {
    if (!(await this.analytics.eventExists(eventId))) {
      throw AppError.notFound("That event");
    }
    await this.analytics.record({
      eventId,
      userId: input.userId,
      type: input.type,
      source: input.source?.trim() || null,
      now: this.clock.now(),
    });
    return { recorded: true };
  }

  async overview(
    userId: string,
    input: { from: Date; to: Date; eventId?: string | undefined },
  ) {
    if (input.from.getTime() > input.to.getTime()) {
      throw AppError.validation({ from: ["from must be before to"] });
    }
    const ownedIds = await this.analytics.findOwnedEventIds(userId);
    if (input.eventId) {
      if (!ownedIds.includes(input.eventId)) {
        throw AppError.forbidden("You can only view analytics for your events");
      }
    }
    const eventIds = input.eventId ? [input.eventId] : ownedIds;
    const summary = await this.analytics.summarize({
      eventIds,
      from: input.from,
      to: input.to,
    });
    return {
      from: input.from.toISOString(),
      to: input.to.toISOString(),
      totals: summary.totals,
      event_views: summary.eventViews,
      saved_events: summary.savedEvents,
      events: summary.byEvent,
      daily: summary.daily.map((row) => ({
        date: row.date.toISOString().slice(0, 10),
        impressions: row.impressions,
        views: row.views,
        clicks: row.clicks,
        saves: row.saves,
        shares: row.shares,
        websiteClicks: row.websiteClicks,
      })),
    };
  }
}
