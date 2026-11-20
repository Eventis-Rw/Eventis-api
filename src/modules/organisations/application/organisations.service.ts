import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import type {
  BusinessVerificationStatus,
  OrganisationRole,
  OrganiserPlanInterval,
  PaymentMethod,
  PromotionPlacement,
  PromotionStatus,
  Prisma,
} from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  normalizeRwandaPhone,
  PhoneNormalizationError,
} from "../../identity/index.js";
import { OrganisationRepository } from "../infrastructure/organisation.repository.js";
import { SensitiveDataCipher } from "../infrastructure/sensitive-data.cipher.js";
import {
  toBusinessVerification,
  toOrganisationDetail,
  toOrganisationSummary,
  toPlanResponse,
  toPromotionResponse,
  toPublisherProfile,
  toSubscriptionResponse,
} from "../mappers/organisation.mapper.js";

export interface OrganisationInput {
  name: string;
  description: string;
  activities: string;
  location: string;
  website?: string | null | undefined;
  businessType?: string | null | undefined;
  logoKey?: string | null | undefined;
}

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly organisations: OrganisationRepository,
    private readonly cipher: SensitiveDataCipher,
    private readonly clock: Clock,
  ) {}

  async create(ownerId: string, input: OrganisationInput) {
    const organisation = await this.organisations.create({
      ownerId,
      name: input.name.trim(),
      description: input.description.trim(),
      activities: input.activities.trim(),
      location: input.location.trim(),
      website: input.website?.trim() || null,
      businessType: input.businessType?.trim() || null,
      logoKey: input.logoKey?.trim() || null,
    });
    return toOrganisationSummary(organisation);
  }

  async listMine(userId: string) {
    const rows = await this.organisations.listForUser(userId);
    return {
      items: rows.map((row) => ({
        ...toOrganisationSummary(row.organisation),
        role: row.role,
      })),
    };
  }

  async get(organisationId: string) {
    const row = await this.organisations.findById(organisationId);
    if (!row) throw AppError.notFound("That organisation");
    return toOrganisationDetail(row);
  }

  async update(
    userId: string,
    organisationId: string,
    input: {
      name?: string | undefined;
      description?: string | undefined;
      activities?: string | undefined;
      location?: string | undefined;
      website?: string | null | undefined;
      businessType?: string | null | undefined;
      logoKey?: string | null | undefined;
    },
  ) {
    await this.requireRole(organisationId, userId, ["OWNER", "ADMIN"]);
    const organisation = await this.organisations.update(organisationId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim() }
        : {}),
      ...(input.activities !== undefined
        ? { activities: input.activities.trim() }
        : {}),
      ...(input.location !== undefined
        ? { location: input.location.trim() }
        : {}),
      ...(input.website !== undefined
        ? { website: input.website?.trim() || null }
        : {}),
      ...(input.businessType !== undefined
        ? { businessType: input.businessType?.trim() || null }
        : {}),
      ...(input.logoKey !== undefined
        ? { logoKey: input.logoKey?.trim() || null }
        : {}),
    });
    return toOrganisationSummary(organisation);
  }

  async remove(userId: string, organisationId: string) {
    const role = await this.requireRole(organisationId, userId, ["OWNER"]);
    if (role.role !== "OWNER") {
      throw AppError.forbidden("Only the organisation owner can delete it");
    }
    await this.organisations.softDelete(organisationId, this.clock.now());
    return { id: organisationId, deleted: true };
  }

  async addMember(
    userId: string,
    organisationId: string,
    input: { userId: string; role: OrganisationRole },
  ) {
    await this.requireRole(organisationId, userId, ["OWNER", "ADMIN"]);
    if (input.role === "OWNER") {
      throw AppError.validation({
        role: ["Use ownership transfer instead of adding another owner"],
      });
    }
    const member = await this.organisations.addMember({
      organisationId,
      userId: input.userId,
      role: input.role,
    });
    return {
      organisationId,
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
    };
  }

  async removeMember(
    userId: string,
    organisationId: string,
    memberUserId: string,
  ) {
    const actor = await this.requireRole(organisationId, userId, [
      "OWNER",
      "ADMIN",
    ]);
    if (memberUserId === actor.userId) {
      throw AppError.validation({
        userId: ["You cannot remove your own membership"],
      });
    }
    const removed = await this.organisations.removeMember(
      organisationId,
      memberUserId,
    );
    if (!removed) throw AppError.notFound("That organisation member");
    return { removed: true };
  }

  async setActiveOrganisation(
    userId: string,
    organisationId: string | null,
  ) {
    if (organisationId) {
      await this.requireMembership(organisationId, userId);
    }
    await this.organisations.setActiveOrganisation(userId, organisationId);
    return { activeOrganisationId: organisationId };
  }

  async getPublisherProfile(userId: string) {
    const profile = await this.organisations.getPublisherProfile(userId);
    return toPublisherProfile(
      profile,
      profile?.taxIdEncrypted
        ? this.cipher.decrypt(profile.taxIdEncrypted).slice(-4)
        : null,
    );
  }

  async updatePublisherProfile(
    userId: string,
    input: {
      contactEmail?: string | null | undefined;
      contactPhone?: string | null | undefined;
      website?: string | null | undefined;
      socialLinks?: Record<string, string> | undefined;
      legalName?: string | null | undefined;
      registrationNumber?: string | null | undefined;
      taxId?: string | null | undefined;
      categoryIds?: string[] | undefined;
    },
  ) {
    if (input.categoryIds !== undefined) {
      if (input.categoryIds.length > 5) {
        throw AppError.validation({
          categoryIds: ["Choose no more than 5 categories"],
        });
      }
      const count = await this.organisations.countCategories(
        input.categoryIds,
      );
      if (count !== new Set(input.categoryIds).size) {
        throw AppError.validation({
          categoryIds: ["One or more categories do not exist"],
        });
      }
    }
    if (input.taxId != null && !/^\d{9}$/.test(input.taxId)) {
      throw AppError.validation({
        taxId: ["Tax ID must be 9 digits"],
      });
    }
    const current = await this.organisations.getPublisherProfile(userId);
    await this.organisations.upsertPublisherProfile(
      userId,
      {
        contactEmail:
          input.contactEmail === undefined
            ? (current?.contactEmail ?? null)
            : input.contactEmail?.trim() || null,
        contactPhone:
          input.contactPhone === undefined
            ? (current?.contactPhone ?? null)
            : normalizeOptionalPhone(input.contactPhone),
        website:
          input.website === undefined
            ? (current?.website ?? null)
            : input.website?.trim() || null,
        socialLinks:
          input.socialLinks === undefined
            ? ((current?.socialLinks as Prisma.InputJsonValue) ?? {})
            : input.socialLinks,
        legalName:
          input.legalName === undefined
            ? (current?.legalName ?? null)
            : input.legalName?.trim() || null,
        registrationNumber:
          input.registrationNumber === undefined
            ? (current?.registrationNumber ?? null)
            : input.registrationNumber?.trim() || null,
        taxIdEncrypted:
          input.taxId === undefined
            ? (current?.taxIdEncrypted ?? null)
            : input.taxId
              ? this.cipher.encrypt(input.taxId)
              : null,
      },
      input.categoryIds,
    );
    return this.getPublisherProfile(userId);
  }

  async submitBusinessVerification(
    userId: string,
    organisationId: string,
    input: {
      legalName: string;
      registrationNumber: string;
      taxId: string;
      representativeName: string;
      paymentWebsite: string;
      documentKey: string;
    },
  ) {
    await this.requireRole(organisationId, userId, ["OWNER", "ADMIN"]);
    if (!/^\d{9}$/.test(input.taxId)) {
      throw AppError.validation({ taxId: ["Tax ID must be 9 digits"] });
    }
    const row = await this.organisations.upsertBusinessVerification({
      organisationId,
      legalName: input.legalName.trim(),
      registrationNumber: input.registrationNumber.trim(),
      taxIdEncrypted: this.cipher.encrypt(input.taxId),
      representativeName: input.representativeName.trim(),
      paymentWebsite: input.paymentWebsite.trim(),
      documentKey: input.documentKey.trim(),
    });
    return toBusinessVerification(row);
  }

  async getBusinessVerification(userId: string, organisationId: string) {
    await this.requireMembership(organisationId, userId);
    return toBusinessVerification(
      await this.organisations.getBusinessVerification(organisationId),
    );
  }

  async listBusinessVerifications(input: {
    page: number;
    limit: number;
    status?: BusinessVerificationStatus | undefined;
  }) {
    const { items, total } =
      await this.organisations.listBusinessVerifications({
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        status: input.status,
      });
    return {
      items: items.map(toBusinessVerification),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async reviewBusinessVerification(
    adminUserId: string,
    id: string,
    input: {
      status: BusinessVerificationStatus;
      rejectionReason?: string | null | undefined;
    },
  ) {
    if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
      throw AppError.validation({
        rejectionReason: ["Explain why the verification was rejected"],
      });
    }
    const row = await this.organisations.reviewBusinessVerification({
      id,
      status: input.status,
      reviewerId: adminUserId,
      rejectionReason:
        input.status === "REJECTED"
          ? (input.rejectionReason?.trim() ?? null)
          : null,
      now: this.clock.now(),
    });
    if (!row) throw AppError.notFound("That business verification");
    return toBusinessVerification(row);
  }

  async listPlans() {
    return {
      items: (await this.organisations.listPlans()).map(toPlanResponse),
    };
  }

  async createPlan(input: {
    code: string;
    name: string;
    interval: OrganiserPlanInterval;
    priceMinor: bigint;
    durationDays: number;
    postQuota?: number | null | undefined;
    features?: Prisma.InputJsonValue | undefined;
    recommended?: boolean | undefined;
    badge?: string | null | undefined;
  }) {
    const plan = await this.organisations.createPlan({
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      interval: input.interval,
      priceMinor: input.priceMinor,
      durationDays: input.durationDays,
      postQuota: input.postQuota ?? null,
      features: input.features ?? [],
      recommended: input.recommended ?? false,
      badge: input.badge?.trim() || null,
    });
    return toPlanResponse(plan);
  }

  async updatePlan(
    id: string,
    input: {
      name?: string | undefined;
      priceMinor?: bigint | undefined;
      durationDays?: number | undefined;
      postQuota?: number | null | undefined;
      features?: Prisma.InputJsonValue | undefined;
      recommended?: boolean | undefined;
      badge?: string | null | undefined;
      active?: boolean | undefined;
    },
  ) {
    const plan = await this.organisations.updatePlan(id, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.priceMinor !== undefined
        ? { priceMinor: input.priceMinor }
        : {}),
      ...(input.durationDays !== undefined
        ? { durationDays: input.durationDays }
        : {}),
      ...(input.postQuota !== undefined
        ? { postQuota: input.postQuota }
        : {}),
      ...(input.features !== undefined
        ? { features: input.features }
        : {}),
      ...(input.recommended !== undefined
        ? { recommended: input.recommended }
        : {}),
      ...(input.badge !== undefined
        ? { badge: input.badge?.trim() || null }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    });
    return toPlanResponse(plan);
  }

  async listSubscriptions(userId: string) {
    const rows = await this.organisations.listSubscriptions(userId);
    return { items: rows.map(toSubscriptionResponse) };
  }

  async createSubscription(
    userId: string,
    input: {
      planId: string;
      paymentMethod: PaymentMethod;
      phoneNumber: string;
    },
  ) {
    const plan = await this.organisations.findPlan(input.planId);
    if (!plan || !plan.active) {
      throw AppError.notFound("That organiser plan");
    }
    if (plan.priceMinor <= 0n) {
      throw AppError.validation({
        planId: ["Free plans are activated by an administrator"],
      });
    }
    const existing = await this.organisations.listSubscriptions(userId);
    if (existing.some((row) => row.status === "ACTIVE")) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "You already have an active organiser plan",
      );
    }
    const result = await this.organisations.createSubscription({
      userId,
      planId: plan.id,
      paymentMethod: input.paymentMethod,
      phoneNumber: normalizePhone(input.phoneNumber),
      amountMinor: plan.priceMinor,
      currency: plan.currency,
      provider: "manual",
      expiresAt: new Date(this.clock.now().getTime() + 60 * 60 * 1000),
    });
    return {
      ...toSubscriptionResponse({
        ...result.subscription,
        plan,
        payment: null,
      }),
      paymentId: result.paymentId,
    };
  }

  async cancelSubscription(userId: string, id: string) {
    const row = await this.organisations.findSubscription(id);
    if (!row || row.userId !== userId) {
      throw AppError.notFound("That organiser subscription");
    }
    if (row.status === "CANCELLED") {
      return toSubscriptionResponse(row);
    }
    return toSubscriptionResponse(
      await this.organisations.cancelSubscription(id),
    );
  }

  async activateSubscription(adminUserId: string, id: string) {
    void adminUserId;
    const row = await this.organisations.activateSubscription({
      id,
      now: this.clock.now(),
    });
    if (!row) throw AppError.notFound("That organiser subscription");
    return toSubscriptionResponse(row);
  }

  async createPromotion(
    userId: string,
    input: {
      eventId: string;
      placement: PromotionPlacement;
      durationDays: number;
      priceMinor?: bigint | undefined;
    },
  ) {
    const owned = await this.organisations.eventOwnedByUser(
      input.eventId,
      userId,
    );
    if (!owned) {
      throw AppError.forbidden("You can only promote your own events");
    }
    const row = await this.organisations.createPromotion({
      eventId: input.eventId,
      ownerId: userId,
      placement: input.placement,
      durationDays: input.durationDays,
      priceMinor: input.priceMinor ?? null,
    });
    return toPromotionResponse(row);
  }

  async listPromotions(
    userId: string,
    input: {
      page: number;
      limit: number;
      status?: PromotionStatus | undefined;
    },
  ) {
    const { items, total } = await this.organisations.listPromotions({
      userId,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      status: input.status,
    });
    return {
      items: items.map(toPromotionResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async listAllPromotions(input: {
    page: number;
    limit: number;
    status?: PromotionStatus | undefined;
  }) {
    const { items, total } = await this.organisations.listPromotions({
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      status: input.status,
    });
    return {
      items: items.map(toPromotionResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async reviewPromotion(
    adminUserId: string,
    id: string,
    input: {
      status: PromotionStatus;
      rejectionReason?: string | null | undefined;
    },
  ) {
    if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
      throw AppError.validation({
        rejectionReason: ["Explain why the promotion was rejected"],
      });
    }
    const row = await this.organisations.reviewPromotion({
      id,
      status: input.status,
      reviewerId: adminUserId,
      rejectionReason:
        input.status === "REJECTED"
          ? (input.rejectionReason?.trim() ?? null)
          : null,
      now: this.clock.now(),
    });
    if (!row) throw AppError.notFound("That promotion");
    return toPromotionResponse(row);
  }

  async activatePromotion(id: string) {
    const row = await this.organisations.activatePromotion(
      id,
      this.clock.now(),
    );
    if (!row) throw AppError.notFound("That promotion");
    return toPromotionResponse(row);
  }

  async cancelPromotion(userId: string, id: string) {
    const row = await this.organisations.findPromotion(id);
    if (!row || row.ownerId !== userId) {
      throw AppError.notFound("That promotion");
    }
    return toPromotionResponse(
      await this.organisations.cancelPromotion(id),
    );
  }

  private async requireMembership(
    organisationId: string,
    userId: string,
  ) {
    const member = await this.organisations.findMembership(
      organisationId,
      userId,
    );
    if (!member) throw AppError.forbidden();
    return member;
  }

  private async requireRole(
    organisationId: string,
    userId: string,
    roles: OrganisationRole[],
  ) {
    const member = await this.requireMembership(organisationId, userId);
    if (!roles.includes(member.role)) {
      throw AppError.forbidden();
    }
    return member;
  }
}

function normalizePhone(value: string): string {
  try {
    return normalizeRwandaPhone(value);
  } catch (error) {
    if (error instanceof PhoneNormalizationError) {
      throw AppError.validation({
        phoneNumber: ["Enter a valid Rwanda mobile number"],
      });
    }
    throw error;
  }
}

function normalizeOptionalPhone(value: string | null): string | null {
  if (!value?.trim()) return null;
  return normalizePhone(value);
}
