import { Injectable } from '@nestjs/common';
import { type Event as PrismaEvent } from '@prisma/client';

import { PrismaService } from '../../../infrastructure/database/prisma.service.js';
import type { Event, EventStatus } from '../domain/event.js';

/**
 * INFRASTRUCTURE LAYER.
 *
 * The only place in this module that imports Prisma or knows a table exists.
 * It returns DOMAIN types, never Prisma models — that boundary is what lets the
 * schema change without touching the service, and what stops an internal column
 * from travelling up to a controller and out to a client.
 */
@Injectable()
export class EventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    title: string;
    description: string | null;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
    venueName: string;
    address: string;
  }): Promise<Event> {
    const row = await this.prisma.event.create({
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        venueName: input.venueName,
        address: input.address,
      },
    });
    return toDomain(row);
  }

  async findById(id: string): Promise<Event | null> {
    const row = await this.prisma.event.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async update(
    id: string,
    input: {
      title: string;
      description: string | null;
      status: EventStatus;
      startsAt: Date;
      endsAt: Date;
      venueName: string;
      address: string;
    },
  ): Promise<Event> {
    const row = await this.prisma.event.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        status: input.status,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        venueName: input.venueName,
        address: input.address,
      },
    });
    return toDomain(row);
  }
}

function toDomain(row: PrismaEvent): Event {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    venueName: row.venueName,
    address: row.address,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
