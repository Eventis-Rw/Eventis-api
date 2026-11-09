import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { Event, EventStatus } from "../domain/event.js";

type EventWithSaves = Prisma.EventGetPayload<{
  include: { _count: { select: { savedBy: true } } };
}>;

const eventWithSaves = {
  _count: { select: { savedBy: true } },
} satisfies Prisma.EventInclude;


@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    title: string;
    description: string | null;
    coverImage: string | null;
    category: string | null;
    categoryId: string | null;
    location: string;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    startDate: Date;
    time: string;
    endDate: Date | null;
    endTime: string | null;
    timezone: string;
    status: EventStatus;
    capacity: number | null;
    isPaid: boolean;
    priceMinor: bigint | null;
    currency: string;
    bookingUrl: string | null;
    instructions: string | null;
    tags: string[];
    organisationId: string | null;
    posterId: string;
  }): Promise<Event> {
    const row = await this.prisma.event.create({
      data: {
        ...input,
        viewsCount: 0,
      },
      include: eventWithSaves,
    });
    return toDomain(row);
  }

  async findById(eventId: string): Promise<Event | null> {
    const row = await this.prisma.event.findUnique({
      where: { eventId },
      include: eventWithSaves,
    });
    return row ? toDomain(row) : null;
  }

  async list(params: {
    page: number;
    limit: number;
    category?: string | undefined;
    search?: string | undefined;
    status?: EventStatus | undefined;
  }): Promise<{ items: Event[]; total: number }> {
    const where: Prisma.EventWhereInput = {};

    if (params.status) {
      where.status = params.status;
    }
    if (params.category) {
      where.category = params.category;
    }
    if (params.search) {
      where.OR = [
        { title: { contains: params.search, mode: "insensitive" } },
        { description: { contains: params.search, mode: "insensitive" } },
        { location: { contains: params.search, mode: "insensitive" } },
      ];
    }

    const skip = (params.page - 1) * params.limit;

    const [rows, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: [{ startDate: "asc" }, { createdAt: "desc" }],
        skip,
        take: params.limit,
        include: eventWithSaves,
      }),
      this.prisma.event.count({ where }),
    ]);

    return { items: rows.map(toDomain), total };
  }

  async update(
    eventId: string,
    input: {
      title: string;
      description: string | null;
      coverImage: string | null;
      category: string | null;
      categoryId: string | null;
      location: string;
      city: string | null;
      latitude: number | null;
      longitude: number | null;
      startDate: Date;
      time: string;
      endDate: Date | null;
      endTime: string | null;
      timezone: string;
      status: EventStatus;
      capacity: number | null;
      isPaid: boolean;
      priceMinor: bigint | null;
      currency: string;
      bookingUrl: string | null;
      instructions: string | null;
      tags: string[];
      organisationId: string | null;
    },
  ): Promise<Event> {
    const row = await this.prisma.event.update({
      where: { eventId },
      data: input,
      include: eventWithSaves,
    });
    return toDomain(row);
  }

  async delete(eventId: string): Promise<void> {
    await this.prisma.event.delete({ where: { eventId } });
  }


  async incrementViews(eventId: string): Promise<Event> {
    const row = await this.prisma.event.update({
      where: { eventId },
      data: { viewsCount: { increment: 1 } },
      include: eventWithSaves,
    });
    return toDomain(row);
  }
}

function toDomain(row: EventWithSaves): Event {
  return {
    eventId: row.eventId,
    title: row.title,
    description: row.description,
    coverImage: row.coverImage,
    category: row.category,
    categoryId: row.categoryId,
    location: row.location,
    city: row.city,
    latitude: row.latitude?.toNumber() ?? null,
    longitude: row.longitude?.toNumber() ?? null,
    startDate: row.startDate,
    time: row.time,
    endDate: row.endDate,
    endTime: row.endTime,
    timezone: row.timezone,
    status: row.status,
    capacity: row.capacity,
    isPaid: row.isPaid,
    priceMinor: row.priceMinor,
    currency: row.currency,
    bookingUrl: row.bookingUrl,
    instructions: row.instructions,
    tags: row.tags,
    organisationId: row.organisationId,
    viewsCount: row.viewsCount,
    savesCount: row._count.savedBy,
    ratingAvg: Number(row.ratingAvg),
    reviewCount: row.reviewCount,
    posterId: row.posterId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
