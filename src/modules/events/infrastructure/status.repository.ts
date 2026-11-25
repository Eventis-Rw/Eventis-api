import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

const withOwnerAndViews = {
  user: { select: { organizationName: true, firstName: true, lastName: true, displayName: true, username: true, avatarUrl: true } },
  organisation: { select: { id: true, name: true, logoKey: true } },
  _count: { select: { views: true } },
} satisfies Prisma.StatusInclude;
export type StatusRecord = Prisma.StatusGetPayload<{ include: typeof withOwnerAndViews }>;

const withViewer = { viewer: true } satisfies Prisma.StatusViewInclude;
export type StatusViewerRecord = Prisma.StatusViewGetPayload<{ include: typeof withViewer }>;

@Injectable()
export class StatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  async ownsPublishedEvent(eventId: string, userId: string): Promise<boolean> {
    return Boolean(await this.prisma.event.findFirst({ where: { eventId, posterId: userId, status: "published" }, select: { eventId: true } }));
  }

  async publishingOrganisation(userId: string, requestedId?: string): Promise<string | null> {
    if (requestedId) {
      const org = await this.prisma.organisation.findFirst({ where: { id: requestedId, ownerId: userId, deletedAt: null }, select: { id: true } });
      return org?.id ?? null;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { activeOrganisationId: true, ownedOrganisations: { where: { deletedAt: null }, select: { id: true } } },
    });
    const owned = user?.ownedOrganisations ?? [];
    return owned.find(org => org.id === user?.activeOrganisationId)?.id ?? (owned.length === 1 ? owned[0]!.id : null);
  }

  create(input: { organisationId: string | null; userId: string; eventId: string | null; mediaUrl: string | null; mediaType: string; caption: string | null; fit: string; background: string; overlays: unknown; createdAt: Date; expiresAt: Date }): Promise<StatusRecord> {
    return this.prisma.status.create({ data: { ...input, overlays: input.overlays as Prisma.InputJsonValue }, include: withOwnerAndViews });
  }

  listFeed(userId: string, now: Date): Promise<StatusRecord[]> {
    return this.prisma.status.findMany({ where: { expiresAt: { gt: now }, userId: { not: userId } }, include: withOwnerAndViews, orderBy: { createdAt: "asc" } });
  }

  listMine(userId: string, now: Date): Promise<StatusRecord[]> {
    return this.prisma.status.findMany({ where: { expiresAt: { gt: now }, userId }, include: withOwnerAndViews, orderBy: { createdAt: "asc" } });
  }

  findActive(id: string, now: Date): Promise<StatusRecord | null> {
    return this.prisma.status.findFirst({ where: { id, expiresAt: { gt: now } }, include: withOwnerAndViews });
  }

  findActiveOwner(id: string, now: Date): Promise<{ id: string; userId: string } | null> {
    return this.prisma.status.findFirst({ where: { id, expiresAt: { gt: now } }, select: { id: true, userId: true } });
  }

  findOwned(id: string, userId: string): Promise<{ id: string; mediaUrl: string | null } | null> {
    return this.prisma.status.findFirst({ where: { id, userId }, select: { id: true, mediaUrl: true } });
  }

  delete(id: string): Promise<unknown> {
    return this.prisma.status.delete({ where: { id } });
  }

  async recordView(statusId: string, viewerId: string, viewedAt: Date): Promise<number> {
    await this.prisma.statusView.upsert({
      where: { statusId_viewerId: { statusId, viewerId } },
      create: { statusId, viewerId, viewedAt }, update: { viewedAt },
    });
    return this.prisma.statusView.count({ where: { statusId } });
  }

  countViews(statusId: string): Promise<number> {
    return this.prisma.statusView.count({ where: { statusId } });
  }

  listViewers(statusId: string): Promise<StatusViewerRecord[]> {
    return this.prisma.statusView.findMany({
      where: { statusId },
      include: withViewer,
      orderBy: { viewedAt: "desc" },
    });
  }
}
