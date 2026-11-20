import type {
  BusinessVerification,
  BusinessVerificationStatus,
  Organisation,
  OrganiserPlan,
  OrganiserSubscription,
  Promotion,
  PublisherProfile,
} from "@prisma/client";

import type { OrganisationWithRelations } from "../infrastructure/organisation.repository.js";

export function toOrganisationSummary(organisation: Organisation) {
  return {
    id: organisation.id,
    ownerId: organisation.ownerId,
    name: organisation.name,
    description: organisation.description,
    activities: organisation.activities,
    location: organisation.location,
    website: organisation.website,
    logoKey: organisation.logoKey,
    businessType: organisation.businessType,
    verificationStatus: organisation.verificationStatus,
    createdAt: organisation.createdAt.toISOString(),
  };
}

export function toOrganisationDetail(row: OrganisationWithRelations) {
  return {
    ...toOrganisationSummary(row),
    members: row.members.map((member) => ({
      userId: member.userId,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      name:
        member.user.displayName ??
        [member.user.firstName, member.user.lastName]
          .filter(Boolean)
          .join(" ") ??
        null,
      avatarUrl: member.user.avatarUrl,
      phone: member.user.phone,
    })),
  };
}

export function toPublisherProfile(
  profile:
    | (PublisherProfile & { categories: Array<{ categoryId: string }> })
    | null,
  taxIdLast4: string | null,
) {
  if (!profile) return null;
  return {
    contactEmail: profile.contactEmail,
    contactPhone: profile.contactPhone,
    website: profile.website,
    socialLinks: profile.socialLinks,
    legalName: profile.legalName,
    registrationNumber: profile.registrationNumber,
    taxIdLast4,
    categoryIds: profile.categories.map((row) => row.categoryId),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

export function toBusinessVerification(row: BusinessVerification | null) {
  if (!row) return null;
  return {
    id: row.id,
    organisationId: row.organisationId,
    legalName: row.legalName,
    registrationNumber: row.registrationNumber,
    representativeName: row.representativeName,
    paymentWebsite: row.paymentWebsite,
    documentKey: row.documentKey,
    status: row.status,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export function toPlanResponse(plan: OrganiserPlan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    interval: plan.interval,
    priceMinor: plan.priceMinor.toString(),
    currency: plan.currency,
    durationDays: plan.durationDays,
    postQuota: plan.postQuota,
    features: plan.features,
    recommended: plan.recommended,
    badge: plan.badge,
    active: plan.active,
  };
}

export function toSubscriptionResponse(
  row: OrganiserSubscription & {
    plan?: OrganiserPlan | null;
    payment?: {
      id: string;
      reference: string;
      status: string;
      amountMinor: bigint;
      currency: string;
      expiresAt: Date;
    } | null;
  },
) {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId,
    status: row.status,
    startsAt: row.startsAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    postsRemaining: row.postsRemaining,
    createdAt: row.createdAt.toISOString(),
    plan: row.plan ? toPlanResponse(row.plan) : undefined,
    payment: row.payment
      ? {
          id: row.payment.id,
          reference: row.payment.reference,
          status: row.payment.status,
          amountMinor: row.payment.amountMinor.toString(),
          currency: row.payment.currency,
          expiresAt: row.payment.expiresAt.toISOString(),
        }
      : undefined,
  };
}

export function toPromotionResponse(row: Promotion) {
  return {
    id: row.id,
    eventId: row.eventId,
    ownerId: row.ownerId,
    placement: row.placement,
    durationDays: row.durationDays,
    status: row.status,
    priceMinor: row.priceMinor?.toString() ?? null,
    paymentId: row.paymentId,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export type { BusinessVerificationStatus };
