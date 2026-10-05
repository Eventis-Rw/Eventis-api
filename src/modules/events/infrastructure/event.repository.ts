import { Injectable } from "@nestjs/common";
import { type Event as PrismaEvent, type Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { Event, EventStatus } from "../domain/event.js";


@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    title: string;
    description: string | null;
    coverImage: string | null;
    category: string | null;
    location: string;
    startDate: Date;
    time: string;
    status: EventStatus;
    posterId: string;
  }): Promise<Event> {
    const row = await this.prisma.event.create({
      data: {
        title: input.title,
        description: input.description,
        coverImage: input.coverImage,
        category: input.category,
        location: input.location,
        startDate: input.startDate,
        time: input.time,
        status: input.status,
        posterId: input.posterId,
        viewsCount: 0,
      },
    });
    return toDomain(row);
  }

  async findById(eventId: string): Promise<Event | null> {
    const row = await this.prisma.event.findUnique({ where: { eventId } });
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
      location: string;
      startDate: Date;
      time: string;
      status: EventStatus;
    },
  ): Promise<Event> {
    const row = await this.prisma.event.update({
      where: { eventId },
      data: {
        title: input.title,
        description: input.description,
        coverImage: input.coverImage,
        category: input.category,
        location: input.location,
        startDate: input.startDate,
        time: input.time,
        status: input.status,
      },
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
    });
    return toDomain(row);
  }
}

function toDomain(row: PrismaEvent): Event {
  return {
    eventId: row.eventId,
    title: row.title,
    description: row.description,
    coverImage: row.coverImage,
    category: row.category,
    location: row.location,
    startDate: row.startDate,
    time: row.time,
    status: row.status,
    viewsCount: row.viewsCount,
    posterId: row.posterId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
