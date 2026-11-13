import { Injectable } from "@nestjs/common";
import type {
  BusinessVerification,
  BusinessVerificationStatus,
  Organisation,
  OrganisationMember,
  OrganiserPlanInterval,
  OrganisationRole,
  OrganiserPlan,
  OrganiserSubscription,
  PaymentMethod,
  Prisma,
  Promotion,
  PromotionPlacement,
  PromotionStatus,
  PublisherProfile,
} from "@prisma/client";
import { randomUUID } from "node:crypto";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

export interface OrganisationWithRelations extends Organisation {
  members: Array<
    OrganisationMember & {
      user: {
        firstName: string | null;
        lastName: string | null;
        displayName: string | null;
        avatarUrl: string | null;
        phone: string;
      };
    }
  >;
}

@Injectable()
export class OrganisationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: {
    ownerId: string;
    name: string;
    description: string;
    activities: string;
    location: string;
    website: string | null;
    businessType: string | null;
    logoKey: string | null;
  }): Promise<Organisation> {
    return this.prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: {
          ownerId: input.ownerId,
          name: input.name,
          description: input.description,
          activities: input.activities,
          location: input.location,
          website: input.website,
          businessType: input.businessType,
          logoKey: input.logoKey,
        },
      });
      await tx.organisationMember.create({
        data: {
          organisationId: organisation.id,
          userId: input.ownerId,
          role: "OWNER",
        },
      });
      const user = await tx.user.findUnique({
        where: { id: input.ownerId },
        select: { activeOrganisationId: true },
      });
      if (!user?.activeOrganisationId) {
        await tx.user.update({
          where: { id: input.ownerId },
          data: { activeOrganisationId: organisation.id },
        });
      }
      return organisation;
    });
  }

  async findById(id: string): Promise<OrganisationWithRelations | null> {
    return this.prisma.organisation.findFirst({
      where: { id, deletedAt: null },
      include: {
        members: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                displayName: true,
                avatarUrl: true,
                phone: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    }) as Promise<OrganisationWithRelations | null>;
  }

  async findRawById(id: string): Promise<Organisation | null> {
    return this.prisma.organisation.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async listForUser(userId: string): Promise<
    Array<{ organisation: Organisation; role: OrganisationRole }>
  > {
    const rows = await this.prisma.organisationMember.findMany({
      where: {
        userId,
        organisation: { deletedAt: null },
      },
      include: { organisation: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => ({
      organisation: row.organisation,
      role: row.role,
    }));
  }

  async findMembership(
    organisationId: string,
    userId: string,
  ): Promise<OrganisationMember | null> {
    return this.prisma.organisationMember.findUnique({
      where: { organisationId_userId: { organisationId, userId } },
    });
  }

  async update(
    id: string,
    data: {
      name?: string | undefined;
      description?: string | undefined;
      activities?: string | undefined;
      location?: string | undefined;
      website?: string | null | undefined;
      businessType?: string | null | undefined;
      logoKey?: string | null | undefined;
    },
  ): Promise<Organisation> {
    return this.prisma.organisation.update({
      where: { id },
      data: definedOnly(data) as Prisma.OrganisationUpdateInput,
    });
  }

  async softDelete(id: string, now: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.organisation.update({
        where: { id },
        data: { deletedAt: now },
      }),
      this.prisma.user.updateMany({
        where: { activeOrganisationId: id },
        data: { activeOrganisationId: null },
      }),
    ]);
  }

  async addMember(input: {
    organisationId: string;
    userId: string;
    role: OrganisationRole;
  }): Promise<OrganisationMember> {
    return this.prisma.organisationMember.upsert({
      where: {
        organisationId_userId: {
          organisationId: input.organisationId,
          userId: input.userId,
        },
      },
      create: input,
      update: { role: input.role },
    });
  }

  async removeMember(
    organisationId: string,
    userId: string,
  ): Promise<boolean> {
    const result = await this.prisma.organisationMember.deleteMany({
      where: { organisationId, userId, role: { not: "OWNER" } },
    });
    if (result.count > 0) {
      await this.prisma.user.updateMany({
        where: { id: userId, activeOrganisationId: organisationId },
        data: { activeOrganisationId: null },
      });
    }
    return result.count > 0;
  }

  async setActiveOrganisation(
    userId: string,
    organisationId: string | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { activeOrganisationId: organisationId },
    });
  }

  async getPublisherProfile(userId: string) {
    return this.prisma.publisherProfile.findUnique({
      where: { userId },
      include: {
        categories: { select: { categoryId: true } },
      },
    });
  }

  async upsertPublisherProfile(
    userId: string,
    data: {
      contactEmail: string | null;
      contactPhone: string | null;
      website: string | null;
      socialLinks: Prisma.InputJsonValue;
      legalName: string | null;
      registrationNumber: string | null;
      taxIdEncrypted: string | null;
    },
    categoryIds?: string[] | undefined,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.publisherProfile.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
      if (categoryIds !== undefined) {
        await tx.publisherProfileCategory.deleteMany({ where: { userId } });
        if (categoryIds.length) {
          await tx.publisherProfileCategory.createMany({
            data: categoryIds.map((categoryId) => ({ userId, categoryId })),
            skipDuplicates: true,
          });
        }
      }
      return profile;
    });
  }

  async countCategories(ids: string[]): Promise<number> {
    if (!ids.length) return 0;
    return this.prisma.category.count({
      where: { id: { in: ids }, isActive: true },
    });
  }

  async getBusinessVerification(organisationId: string) {
    return this.prisma.businessVerification.findUnique({
      where: { organisationId },
    });
  }

  async upsertBusinessVerification(input: {
    organisationId: string;
    legalName: string;
    registrationNumber: string;
    taxIdEncrypted: string;
    representativeName: string;
    paymentWebsite: string;
    documentKey: string;
  }): Promise<BusinessVerification> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.businessVerification.upsert({
        where: { organisationId: input.organisationId },
        create: { ...input, status: "PENDING" },
        update: {
          legalName: input.legalName,
          registrationNumber: input.registrationNumber,
          taxIdEncrypted: input.taxIdEncrypted,
          representativeName: input.representativeName,
          paymentWebsite: input.paymentWebsite,
          documentKey: input.documentKey,
          status: "PENDING",
          rejectionReason: null,
          reviewedAt: null,
          reviewedBy: null,
          submittedAt: new Date(),
        },
      });
      await tx.organisation.update({
        where: { id: input.organisationId },
        data: { verificationStatus: "PENDING" },
      });
      return row;
    });
  }

  async listBusinessVerifications(params: {
    skip: number;
    take: number;
    status?: BusinessVerificationStatus | undefined;
  }): Promise<{ items: BusinessVerification[]; total: number }> {
    const where: Prisma.BusinessVerificationWhereInput = params.status
      ? { status: params.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.businessVerification.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.businessVerification.count({ where }),
    ]);
    return { items, total };
  }

  async reviewBusinessVerification(input: {
    id: string;
    status: BusinessVerificationStatus;
    reviewerId: string;
    rejectionReason: string | null;
    now: Date;
  }): Promise<BusinessVerification | null> {
    const existing = await this.prisma.businessVerification.findUnique({
      where: { id: input.id },
    });
    if (!existing) return null;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.businessVerification.update({
        where: { id: input.id },
        data: {
          status: input.status,
          reviewedBy: input.reviewerId,
          reviewedAt: input.now,
          rejectionReason: input.rejectionReason,
        },
      });
      await tx.organisation.update({
        where: { id: row.organisationId },
        data: {
          verificationStatus:
            input.status === "VERIFIED"
              ? "VERIFIED"
              : input.status === "REJECTED"
                ? "REJECTED"
                : "PENDING",
        },
      });
      return row;
    });
  }

  async listPlans(): Promise<OrganiserPlan[]> {
    return this.prisma.organiserPlan.findMany({
      where: { active: true },
      orderBy: [{ recommended: "desc" }, { priceMinor: "asc" }],
    });
  }

  async findPlan(id: string): Promise<OrganiserPlan | null> {
    return this.prisma.organiserPlan.findUnique({ where: { id } });
  }

  async createPlan(input: {
    code: string;
    name: string;
    interval: OrganiserPlanInterval;
    priceMinor: bigint;
    durationDays: number;
    postQuota: number | null;
    features: Prisma.InputJsonValue;
    recommended: boolean;
    badge: string | null;
  }): Promise<OrganiserPlan> {
    return this.prisma.organiserPlan.create({ data: input });
  }

  async updatePlan(
    id: string,
    data: Partial<{
      name: string;
      priceMinor: bigint;
      durationDays: number;
      postQuota: number | null;
      features: Prisma.InputJsonValue;
      recommended: boolean;
      badge: string | null;
      active: boolean;
    }>,
  ): Promise<OrganiserPlan> {
    return this.prisma.organiserPlan.update({ where: { id }, data });
  }

  async createSubscription(input: {
    userId: string;
    planId: string;
    paymentMethod: PaymentMethod;
    phoneNumber: string;
    amountMinor: bigint;
    currency: string;
    provider: string;
    expiresAt: Date;
  }): Promise<{ subscription: OrganiserSubscription; paymentId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const subscription = await tx.organiserSubscription.create({
        data: {
          userId: input.userId,
          planId: input.planId,
          status: "PENDING",
        },
      });
      const payment = await tx.paymentIntent.create({
        data: {
          reference: nextReference("ORG"),
          userId: input.userId,
          purpose: "ORGANISER_PLAN",
          referenceId: subscription.id,
          amountMinor: input.amountMinor,
          currency: input.currency,
          paymentMethod: input.paymentMethod,
          phoneNumber: input.phoneNumber,
          provider: input.provider,
          expiresAt: input.expiresAt,
        },
      });
      const updated = await tx.organiserSubscription.update({
        where: { id: subscription.id },
        data: { paymentId: payment.id },
      });
      return { subscription: updated, paymentId: payment.id };
    });
  }

  async listSubscriptions(userId: string) {
    return this.prisma.organiserSubscription.findMany({
      where: { userId },
      include: { plan: true, payment: true },
      orderBy: { createdAt: "desc" },
    });
  }

  async findSubscription(id: string) {
    return this.prisma.organiserSubscription.findUnique({
      where: { id },
      include: { plan: true, payment: true },
    });
  }

  async activateSubscription(input: {
    id: string;
    now: Date;
  }): Promise<OrganiserSubscription | null> {
    const existing = await this.prisma.organiserSubscription.findUnique({
      where: { id: input.id },
      include: { plan: true },
    });
    if (!existing) return null;
    const startsAt = input.now;
    const expiresAt = new Date(
      startsAt.getTime() + existing.plan.durationDays * 24 * 60 * 60 * 1000,
    );
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.organiserSubscription.update({
        where: { id: input.id },
        data: {
          status: "ACTIVE",
          startsAt,
          expiresAt,
          postsRemaining: existing.plan.postQuota,
        },
      });
      if (existing.paymentId) {
        await tx.paymentIntent.update({
          where: { id: existing.paymentId },
          data: {
            status: "SUCCEEDED",
            paidAt: input.now,
          },
        });
      }
      await tx.user.update({
        where: { id: existing.userId },
        data: { accountType: "POSTER" },
      });
      return row;
    });
  }

  async cancelSubscription(
    id: string,
  ): Promise<OrganiserSubscription> {
    return this.prisma.organiserSubscription.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  async eventOwnedByUser(eventId: string, userId: string) {
    return this.prisma.event.findFirst({
      where: {
        eventId,
        OR: [
          { posterId: userId },
          { organisation: { members: { some: { userId } } } },
        ],
      },
      select: { eventId: true },
    });
  }

  async createPromotion(input: {
    eventId: string;
    ownerId: string;
    placement: PromotionPlacement;
    durationDays: number;
    priceMinor: bigint | null;
  }): Promise<Promotion> {
    return this.prisma.promotion.create({
      data: { ...input, status: "REQUESTED" },
    });
  }

  async listPromotions(params: {
    userId?: string | undefined;
    skip: number;
    take: number;
    status?: PromotionStatus | undefined;
  }): Promise<{ items: Promotion[]; total: number }> {
    const where: Prisma.PromotionWhereInput = {
      ...(params.userId ? { ownerId: params.userId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.promotion.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.promotion.count({ where }),
    ]);
    return { items, total };
  }

  async reviewPromotion(input: {
    id: string;
    status: PromotionStatus;
    reviewerId: string;
    rejectionReason: string | null;
    now: Date;
  }): Promise<Promotion | null> {
    const existing = await this.prisma.promotion.findUnique({
      where: { id: input.id },
    });
    if (!existing) return null;
    return this.prisma.promotion.update({
      where: { id: input.id },
      data: {
        status: input.status,
        reviewedBy: input.reviewerId,
        reviewedAt: input.now,
        rejectionReason: input.rejectionReason,
      },
    });
  }

  async activatePromotion(
    id: string,
    now: Date,
  ): Promise<Promotion | null> {
    const existing = await this.prisma.promotion.findUnique({
      where: { id },
    });
    if (!existing) return null;
    return this.prisma.promotion.update({
      where: { id },
      data: {
        status: "ACTIVE",
        startsAt: now,
        endsAt: new Date(
          now.getTime() + existing.durationDays * 24 * 60 * 60 * 1000,
        ),
      },
    });
  }

  async cancelPromotion(id: string): Promise<Promotion> {
    return this.prisma.promotion.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
  }

  async findPromotion(id: string): Promise<Promotion | null> {
    return this.prisma.promotion.findUnique({ where: { id } });
  }
}

function nextReference(prefix: string): string {
  return `${prefix}${randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
}

export type { PublisherProfile };

function definedOnly<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
