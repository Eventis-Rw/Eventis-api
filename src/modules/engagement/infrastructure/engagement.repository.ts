import { Injectable } from "@nestjs/common";
import type { Prisma, ModerationStatus } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

export interface SavedEventRow {
  userId: string;
  eventId: string;
  createdAt: Date;
  event: {
    eventId: string;
    title: string;
    coverImage: string | null;
    category: string | null;
    location: string;
    startDate: Date;
    time: string;
    status: string;
    posterId: string;
  };
}

export interface SavedOrganiserRow {
  userId: string;
  organisationId: string;
  createdAt: Date;
  organisation: {
    id: string;
    name: string;
    description: string;
    location: string;
    logoKey: string | null;
    verificationStatus: string;
  };
}

export interface ReviewRow {
  id: string;
  eventId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  user?: {
    displayName: string | null;
    firstName: string | null;
    lastName: string | null;
    avatarUrl: string | null;
  } | null;
}

export interface EventReportRow {
  id: string;
  eventId: string;
  reporterId: string;
  reason: string;
  details: string | null;
  status: ModerationStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class EngagementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async eventExists(eventId: string): Promise<boolean> {
    return (
      (await this.prisma.event.count({ where: { eventId } })) === 1
    );
  }

  async organisationExists(organisationId: string): Promise<boolean> {
    const count = await this.prisma.organisation.count({
      where: { id: organisationId, deletedAt: null },
    });
    return count === 1;
  }

  async saveEvent(userId: string, eventId: string): Promise<void> {
    await this.prisma.savedEvent.upsert({
      where: { userId_eventId: { userId, eventId } },
      create: { userId, eventId },
      update: {},
    });
  }

  async unsaveEvent(userId: string, eventId: string): Promise<void> {
    await this.prisma.savedEvent.deleteMany({ where: { userId, eventId } });
  }

  async listSavedEvents(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: SavedEventRow[]; total: number }> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.savedEvent.findMany({
        where,
        include: { event: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.savedEvent.count({ where }),
    ]);
    return { items: rows as SavedEventRow[], total };
  }

  async saveOrganiser(userId: string, organisationId: string): Promise<void> {
    await this.prisma.savedOrganiser.upsert({
      where: { userId_organisationId: { userId, organisationId } },
      create: { userId, organisationId },
      update: {},
    });
  }

  async unsaveOrganiser(
    userId: string,
    organisationId: string,
  ): Promise<void> {
    await this.prisma.savedOrganiser.deleteMany({
      where: { userId, organisationId },
    });
  }

  async listSavedOrganisers(
    userId: string,
    skip: number,
    take: number,
  ): Promise<{ items: SavedOrganiserRow[]; total: number }> {
    const where = { userId };
    const [rows, total] = await Promise.all([
      this.prisma.savedOrganiser.findMany({
        where,
        include: { organisation: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.savedOrganiser.count({ where }),
    ]);
    return { items: rows as SavedOrganiserRow[], total };
  }

  async findReviewById(id: string): Promise<ReviewRow | null> {
    return (await this.prisma.review.findUnique({ where: { id } })) as
      | ReviewRow
      | null;
  }

  async findActiveReview(
    eventId: string,
    userId: string,
  ): Promise<ReviewRow | null> {
    return (await this.prisma.review.findFirst({
      where: { eventId, userId, deletedAt: null },
    })) as ReviewRow | null;
  }

  async createReview(input: {
    eventId: string;
    userId: string;
    rating: number;
    comment: string | null;
  }): Promise<ReviewRow> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.review.create({ data: input });
      await recalculateRating(tx, input.eventId);
      return row as ReviewRow;
    });
  }

  async updateReview(
    id: string,
    input: { rating: number; comment: string | null },
  ): Promise<ReviewRow> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.review.update({
        where: { id },
        data: { ...input, updatedAt: new Date() },
      });
      await recalculateRating(tx, row.eventId);
      return row as ReviewRow;
    });
  }

  async deleteReview(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.review.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
      await recalculateRating(tx, row.eventId);
    });
  }

  async listReviews(
    eventId: string,
    skip: number,
    take: number,
  ): Promise<{ items: ReviewRow[]; total: number }> {
    const where = { eventId, deletedAt: null };
    const [rows, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: {
            select: {
              displayName: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.review.count({ where }),
    ]);
    return { items: rows as ReviewRow[], total };
  }

  async createEventReport(input: {
    eventId: string;
    reporterId: string;
    reason: string;
    details: string | null;
  }): Promise<EventReportRow> {
    return (await this.prisma.eventReport.create({
      data: input,
    })) as EventReportRow;
  }

  async listEventReports(params: {
    skip: number;
    take: number;
    status?: ModerationStatus | undefined;
  }): Promise<{ items: EventReportRow[]; total: number }> {
    const where: Prisma.EventReportWhereInput = params.status
      ? { status: params.status }
      : {};
    const [rows, total] = await Promise.all([
      this.prisma.eventReport.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.eventReport.count({ where }),
    ]);
    return { items: rows as EventReportRow[], total };
  }

  async updateEventReportStatus(input: {
    id: string;
    status: ModerationStatus;
    reviewedBy: string;
    reviewedAt: Date;
  }): Promise<EventReportRow | null> {
    const existing = await this.prisma.eventReport.findUnique({
      where: { id: input.id },
    });
    if (!existing) return null;
    return (await this.prisma.eventReport.update({
      where: { id: input.id },
      data: {
        status: input.status,
        reviewedBy: input.reviewedBy,
        reviewedAt: input.reviewedAt,
      },
    })) as EventReportRow;
  }
}

async function recalculateRating(
  tx: Prisma.TransactionClient,
  eventId: string,
): Promise<void> {
  const aggregate = await tx.review.aggregate({
    where: { eventId, deletedAt: null },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const avg = aggregate._avg.rating ?? 0;
  await tx.event.update({
    where: { eventId },
    data: {
      ratingAvg: Math.round(avg * 100) / 100,
      reviewCount: aggregate._count._all,
    },
  });
}
