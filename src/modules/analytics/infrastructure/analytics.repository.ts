import { Injectable } from "@nestjs/common";
import type { AnalyticsEventType } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

@Injectable()
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async eventExists(eventId: string): Promise<boolean> {
    return (
      (await this.prisma.event.count({ where: { eventId } })) === 1
    );
  }

  async findOwnedEventIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.event.findMany({
      where: {
        OR: [
          { posterId: userId },
          { organisation: { members: { some: { userId } } } },
        ],
      },
      select: { eventId: true },
    });
    return rows.map((row) => row.eventId);
  }

  async record(input: {
    eventId: string;
    userId: string | null;
    type: AnalyticsEventType;
    source: string | null;
    now: Date;
  }): Promise<void> {
    const date = new Date(
      Date.UTC(
        input.now.getUTCFullYear(),
        input.now.getUTCMonth(),
        input.now.getUTCDate(),
      ),
    );
    const field = statField(input.type);
    await this.prisma.$transaction(async (tx) => {
      await tx.analyticsEvent.create({
        data: {
          eventId: input.eventId,
          userId: input.userId,
          type: input.type,
          source: input.source,
          createdAt: input.now,
        },
      });
      await tx.eventStatDaily.upsert({
        where: { eventId_date: { eventId: input.eventId, date } },
        create: {
          eventId: input.eventId,
          date,
          [field]: 1,
        },
        update: {
          [field]: { increment: 1 },
        },
      });
    });
  }

  async summarize(input: {
    eventIds: string[];
    from: Date;
    to: Date;
  }): Promise<{
    totals: Record<AnalyticsEventType, number>;
    eventViews: number;
    savedEvents: number;
    byEvent: Array<{
      eventId: string;
      title: string;
      viewsCount: number;
      saves: number;
      counts: Record<AnalyticsEventType, number>;
    }>;
    daily: Array<{
      date: Date;
      impressions: number;
      views: number;
      clicks: number;
      saves: number;
      shares: number;
      websiteClicks: number;
    }>;
  }> {
    if (!input.eventIds.length) {
      return {
        totals: emptyCounts(),
        eventViews: 0,
        savedEvents: 0,
        byEvent: [],
        daily: [],
      };
    }
    const [grouped, events, saves, daily] = await Promise.all([
      this.prisma.analyticsEvent.groupBy({
        by: ["eventId", "type"],
        where: {
          eventId: { in: input.eventIds },
          createdAt: { gte: input.from, lte: input.to },
        },
        _count: { _all: true },
      }),
      this.prisma.event.findMany({
        where: { eventId: { in: input.eventIds } },
        select: { eventId: true, title: true, viewsCount: true },
      }),
      this.prisma.savedEvent.groupBy({
        by: ["eventId"],
        where: { eventId: { in: input.eventIds } },
        _count: { _all: true },
      }),
      this.prisma.eventStatDaily.findMany({
        where: {
          eventId: { in: input.eventIds },
          date: { gte: startOfDay(input.from), lte: endOfDay(input.to) },
        },
      }),
    ]);

    const totals = emptyCounts();
    const byEventMap = new Map<
      string,
      {
        eventId: string;
        title: string;
        viewsCount: number;
        saves: number;
        counts: Record<AnalyticsEventType, number>;
      }
    >();
    let eventViews = 0;
    for (const event of events) {
      eventViews += event.viewsCount;
      byEventMap.set(event.eventId, {
        eventId: event.eventId,
        title: event.title,
        viewsCount: event.viewsCount,
        saves: 0,
        counts: emptyCounts(),
      });
    }
    let savedEvents = 0;
    for (const row of saves) {
      savedEvents += row._count._all;
      const event = byEventMap.get(row.eventId);
      if (event) event.saves = row._count._all;
    }
    for (const row of grouped) {
      totals[row.type] += row._count._all;
      const event = byEventMap.get(row.eventId);
      if (event) event.counts[row.type] += row._count._all;
    }

    const dailyMap = new Map<
      string,
      {
        date: Date;
        impressions: number;
        views: number;
        clicks: number;
        saves: number;
        shares: number;
        websiteClicks: number;
      }
    >();
    for (const row of daily) {
      const key = row.date.toISOString().slice(0, 10);
      const existing = dailyMap.get(key) ?? {
        date: row.date,
        impressions: 0,
        views: 0,
        clicks: 0,
        saves: 0,
        shares: 0,
        websiteClicks: 0,
      };
      existing.impressions += row.impressions;
      existing.views += row.views;
      existing.clicks += row.clicks;
      existing.saves += row.saves;
      existing.shares += row.shares;
      existing.websiteClicks += row.websiteClicks;
      dailyMap.set(key, existing);
    }

    return {
      totals,
      eventViews,
      savedEvents,
      byEvent: [...byEventMap.values()].sort(
        (a, b) =>
          b.counts.VIEW + b.counts.IMPRESSION - (a.counts.VIEW + a.counts.IMPRESSION),
      ),
      daily: [...dailyMap.values()].sort(
        (a, b) => a.date.getTime() - b.date.getTime(),
      ),
    };
  }
}

function emptyCounts(): Record<AnalyticsEventType, number> {
  return {
    IMPRESSION: 0,
    VIEW: 0,
    CLICK: 0,
    SAVE: 0,
    SHARE: 0,
    WEBSITE_CLICK: 0,
  };
}

type StatField =
  | "impressions"
  | "views"
  | "clicks"
  | "saves"
  | "shares"
  | "websiteClicks";

function statField(type: AnalyticsEventType): StatField {
  switch (type) {
    case "IMPRESSION":
      return "impressions";
    case "VIEW":
      return "views";
    case "CLICK":
      return "clicks";
    case "SAVE":
      return "saves";
    case "SHARE":
      return "shares";
    case "WEBSITE_CLICK":
      return "websiteClicks";
  }
}

function startOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfDay(date: Date): Date {
  return new Date(startOfDay(date).getTime() + 24 * 60 * 60 * 1000 - 1);
}
