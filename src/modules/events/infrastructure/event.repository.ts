import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { Event, EventStatus } from "../domain/event.js";

const eventWithSaves = {
  _count: { select: { savedBy: true } },
  organisation: { select: { name: true, logoKey: true } },
  poster: { select: { avatarUrl: true, ownedOrganisations: { take: 2, select: { name: true, logoKey: true } }, displayName: true, username: true, firstName: true, lastName: true } },
} satisfies Prisma.EventInclude;

type EventWithSaves = Prisma.EventGetPayload<{ include: typeof eventWithSaves }>;

@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  listCategories() {
    return this.prisma.category.findMany({
      select: { id: true, slug: true, name: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
    });
  }

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
    activeSince?: string | undefined;
    excludeCategories?: string[] | undefined;
    viewerId?: string | undefined;
    page: number;
    limit: number;
    category?: string | undefined;
    search?: string | undefined;
    status?: EventStatus | undefined;
    posterId?: string | undefined;
  }): Promise<{ items: Event[]; total: number }> {
    const where: Prisma.EventWhereInput = params.posterId
      ? { posterId: params.posterId }
      : {};

    if (params.activeSince) {
      const since = new Date(params.activeSince);
      const filters: Prisma.EventWhereInput[] = [
        { OR: [{ startDate: { gte: since } }, { endDate: { gte: since } }] },
      ];
      if (params.excludeCategories?.length) {
        filters.push({ OR: [
          { category: null },
          { category: { notIn: params.excludeCategories, mode: "insensitive" } },
        ] });
      }
      where.AND = filters;
    }
    if (params.status) {
      where.status = params.status;
    }
    if (params.category) {
      where.category = { equals: params.category, mode: "insensitive" };
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
        orderBy: [{ startDate: "asc" }, { createdAt: "desc" }, { eventId: "asc" }],
        skip,
        take: params.limit,
        include: {
          ...eventWithSaves,
          ...(params.activeSince ? {
            _count: { select: { savedBy: true, likes: true, comments: { where: { deletedAt: null } } } },
            ...(params.viewerId ? { likes: { where: { userId: params.viewerId }, select: { userId: true } } } : {}),
          } : {}),
        },
      }),
      this.prisma.event.count({ where }),
    ]);

    return { items: rows.map(row => ({
      ...toDomain(row),
      ...("likes" in row._count ? { interactions: {
        likeCount: row._count.likes, commentCount: row._count.comments, liked: !!params.viewerId && row.likes.length > 0,
      } } : {}),
    })), total };
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
  const owned = row.poster.ownedOrganisations;
  const host = row.organisation ?? (owned.length === 1 ? owned[0] : undefined);
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
    organizerAvatarUrl: host?.logoKey && /^https?:\/\//i.test(host.logoKey) ? host.logoKey : row.poster.avatarUrl,
    organizerName: host?.name.trim() || row.poster.displayName?.trim() ||
      row.poster.username?.trim() || [row.poster.firstName, row.poster.lastName].filter(Boolean).join(" ").trim() || null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
