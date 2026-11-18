import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  BusinessVerificationStatus,
  OrganisationRole,
  OrganiserPlanInterval,
  PromotionPlacement,
  PromotionStatus,
} from "@prisma/client";
import { z } from "zod";

import {
  CurrentUser,
} from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  Public,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { OrganisationsService } from "../application/organisations.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const memberParamSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const organisationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(5000),
  activities: z.string().trim().min(1).max(300),
  location: z.string().trim().min(1).max(120),
  website: z.string().trim().url().max(500).nullable().optional(),
  businessType: z.string().trim().max(80).nullable().optional(),
  logoKey: z.string().trim().max(500).nullable().optional(),
});
const organisationPatchSchema = organisationSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
);
const memberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "EDITOR"]),
});
const activeOrganisationSchema = z.object({
  organisationId: z.string().uuid().nullable(),
});
const socialLinksSchema = z
  .record(z.string(), z.string().trim().url().max(500))
  .refine((value) => Object.keys(value).length <= 10);
const publisherProfileSchema = z
  .object({
    contactEmail: z.string().trim().email().max(255).nullable().optional(),
    contactPhone: z.string().trim().max(30).nullable().optional(),
    website: z.string().trim().url().max(500).nullable().optional(),
    socialLinks: socialLinksSchema.optional(),
    legalName: z.string().trim().max(160).nullable().optional(),
    registrationNumber: z.string().trim().max(30).nullable().optional(),
    taxId: z.string().trim().regex(/^\d{9}$/).nullable().optional(),
    categoryIds: z.array(z.string().uuid()).max(5).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const businessVerificationSchema = z.object({
  legalName: z.string().trim().min(2).max(160),
  registrationNumber: z.string().trim().min(3).max(30),
  taxId: z.string().trim().regex(/^\d{9}$/),
  representativeName: z.string().trim().min(2).max(160),
  paymentWebsite: z.string().trim().url().max(500),
  documentKey: z.string().trim().min(1).max(500),
});
const businessVerificationListSchema = pageSchema.extend({
  status: z.enum(["PENDING", "VERIFIED", "REJECTED"]).optional(),
});
const businessVerificationReviewSchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED"]),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
});
const planSchema = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(120),
  interval: z.enum(["PAY_PER_POST", "MONTHLY", "QUARTERLY", "YEARLY"]),
  priceMinor: z.string().regex(/^\d+$/),
  durationDays: z.coerce.number().int().min(1).max(3650),
  postQuota: z.coerce.number().int().min(0).nullable().optional(),
  features: z.array(z.string().trim().max(200)).max(20).optional(),
  recommended: z.boolean().optional(),
  badge: z.string().trim().max(40).nullable().optional(),
});
const planPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    priceMinor: z.string().regex(/^\d+$/).optional(),
    durationDays: z.coerce.number().int().min(1).max(3650).optional(),
    postQuota: z.coerce.number().int().min(0).nullable().optional(),
    features: z.array(z.string().trim().max(200)).max(20).optional(),
    recommended: z.boolean().optional(),
    badge: z.string().trim().max(40).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const subscriptionSchema = z.object({
  planId: z.string().uuid(),
  paymentMethod: z.enum(["mtn_momo", "airtel_money"]),
  phoneNumber: z.string().trim().min(1).max(30),
});
const promotionSchema = z.object({
  eventId: z.string().uuid(),
  placement: z.enum([
    "HOME_BANNER",
    "FEATURED",
    "CATEGORY_HIGHLIGHT",
    "NEARBY_PROMOTED",
    "SPONSORED_AD",
  ]),
  durationDays: z.coerce.number().int().min(1).max(365),
  priceMinor: z.string().regex(/^\d+$/).optional(),
});
const promotionListSchema = pageSchema.extend({
  status: z
    .enum([
      "REQUESTED",
      "APPROVED",
      "ACTIVE",
      "EXPIRED",
      "REJECTED",
      "CANCELLED",
    ])
    .optional(),
});
const promotionReviewSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
});

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Roles("organizer_owner", "admin")
  @Post("organisations")
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(organisationSchema))
    body: z.infer<typeof organisationSchema>,
  ) {
    return this.organisations.create(requireUser(user).userId, body);
  }

  @Get("me/organisations")
  listMine(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.organisations.listMine(requireUser(user).userId);
  }

  @Public()
  @Get("organisations/:id")
  get(@Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>) {
    return this.organisations.get(params.id);
  }

  @Roles("organizer_owner", "admin")
  @Patch("organisations/:id")
  update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(organisationPatchSchema))
    body: z.infer<typeof organisationPatchSchema>,
  ) {
    return this.organisations.update(
      requireUser(user).userId,
      params.id,
      body,
    );
  }

  @Roles("organizer_owner", "admin")
  @Delete("organisations/:id")
  remove(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.organisations.remove(requireUser(user).userId, params.id);
  }

  @Roles("organizer_owner", "admin")
  @Post("organisations/:id/members")
  addMember(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(memberSchema)) body: z.infer<typeof memberSchema>,
  ) {
    return this.organisations.addMember(
      requireUser(user).userId,
      params.id,
      { userId: body.userId, role: body.role as OrganisationRole },
    );
  }

  @Roles("organizer_owner", "admin")
  @Delete("organisations/:id/members/:userId")
  removeMember(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(memberParamSchema))
    params: z.infer<typeof memberParamSchema>,
  ) {
    return this.organisations.removeMember(
      requireUser(user).userId,
      params.id,
      params.userId,
    );
  }

  @Put("me/active-organisation")
  setActiveOrganisation(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(activeOrganisationSchema))
    body: z.infer<typeof activeOrganisationSchema>,
  ) {
    return this.organisations.setActiveOrganisation(
      requireUser(user).userId,
      body.organisationId,
    );
  }

  @Roles("organizer_owner", "admin")
  @Get("me/publisher-profile")
  getPublisherProfile(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.organisations.getPublisherProfile(requireUser(user).userId);
  }

  @Roles("organizer_owner", "admin")
  @Patch("me/publisher-profile")
  updatePublisherProfile(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(publisherProfileSchema))
    body: z.infer<typeof publisherProfileSchema>,
  ) {
    return this.organisations.updatePublisherProfile(
      requireUser(user).userId,
      body,
    );
  }

  @Roles("organizer_owner", "admin")
  @Post("organisations/:id/business-verification")
  submitBusinessVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(businessVerificationSchema))
    body: z.infer<typeof businessVerificationSchema>,
  ) {
    return this.organisations.submitBusinessVerification(
      requireUser(user).userId,
      params.id,
      body,
    );
  }

  @Roles("organizer_owner", "admin")
  @Get("organisations/:id/business-verification")
  getBusinessVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.organisations.getBusinessVerification(
      requireUser(user).userId,
      params.id,
    );
  }

  @Roles("admin")
  @Get("admin/business-verifications")
  listBusinessVerifications(
    @Query(zodPipe(businessVerificationListSchema))
    query: z.infer<typeof businessVerificationListSchema>,
  ) {
    return this.organisations.listBusinessVerifications({
      page: query.page,
      limit: query.limit,
      status: query.status as BusinessVerificationStatus | undefined,
    });
  }

  @Roles("admin")
  @Patch("admin/business-verifications/:id")
  reviewBusinessVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(businessVerificationReviewSchema))
    body: z.infer<typeof businessVerificationReviewSchema>,
  ) {
    return this.organisations.reviewBusinessVerification(
      requireUser(user).userId,
      params.id,
      {
        status: body.status,
        rejectionReason: body.rejectionReason,
      },
    );
  }

  @Public()
  @Get("organisations/plans")
  listPlans() {
    return this.organisations.listPlans();
  }

  @Roles("admin")
  @Post("admin/organiser-plans")
  createPlan(
    @Body(zodPipe(planSchema)) body: z.infer<typeof planSchema>,
  ) {
    return this.organisations.createPlan({
      code: body.code,
      name: body.name,
      interval: body.interval as OrganiserPlanInterval,
      priceMinor: BigInt(body.priceMinor),
      durationDays: body.durationDays,
      postQuota: body.postQuota,
      features: body.features,
      recommended: body.recommended,
      badge: body.badge,
    });
  }

  @Roles("admin")
  @Patch("admin/organiser-plans/:id")
  updatePlan(
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(planPatchSchema)) body: z.infer<typeof planPatchSchema>,
  ) {
    return this.organisations.updatePlan(params.id, {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.priceMinor !== undefined
        ? { priceMinor: BigInt(body.priceMinor) }
        : {}),
      ...(body.durationDays !== undefined
        ? { durationDays: body.durationDays }
        : {}),
      ...(body.postQuota !== undefined
        ? { postQuota: body.postQuota }
        : {}),
      ...(body.features !== undefined
        ? { features: body.features }
        : {}),
      ...(body.recommended !== undefined
        ? { recommended: body.recommended }
        : {}),
      ...(body.badge !== undefined ? { badge: body.badge } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    });
  }

  @Get("me/organiser-subscriptions")
  listSubscriptions(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.organisations.listSubscriptions(requireUser(user).userId);
  }

  @Post("me/organiser-subscriptions")
  createSubscription(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(subscriptionSchema))
    body: z.infer<typeof subscriptionSchema>,
  ) {
    return this.organisations.createSubscription(requireUser(user).userId, {
      planId: body.planId,
      paymentMethod:
        body.paymentMethod === "mtn_momo" ? "MTN_MOMO" : "AIRTEL_MONEY",
      phoneNumber: body.phoneNumber,
    });
  }

  @Post("me/organiser-subscriptions/:id/cancel")
  cancelSubscription(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.organisations.cancelSubscription(
      requireUser(user).userId,
      params.id,
    );
  }

  @Roles("admin")
  @Post("admin/organiser-subscriptions/:id/activate")
  activateSubscription(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.organisations.activateSubscription(
      requireUser(user).userId,
      params.id,
    );
  }

  @Roles("organizer_owner", "admin")
  @Post("promotions")
  createPromotion(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(promotionSchema)) body: z.infer<typeof promotionSchema>,
  ) {
    return this.organisations.createPromotion(requireUser(user).userId, {
      eventId: body.eventId,
      placement: body.placement as PromotionPlacement,
      durationDays: body.durationDays,
      priceMinor:
        body.priceMinor === undefined ? undefined : BigInt(body.priceMinor),
    });
  }

  @Roles("organizer_owner", "admin")
  @Get("me/promotions")
  listPromotions(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(promotionListSchema))
    query: z.infer<typeof promotionListSchema>,
  ) {
    return this.organisations.listPromotions(requireUser(user).userId, {
      page: query.page,
      limit: query.limit,
      status: query.status as PromotionStatus | undefined,
    });
  }

  @Roles("organizer_owner", "admin")
  @Post("promotions/:id/cancel")
  cancelPromotion(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.organisations.cancelPromotion(
      requireUser(user).userId,
      params.id,
    );
  }

  @Roles("admin")
  @Get("admin/promotions")
  listAllPromotions(
    @Query(zodPipe(promotionListSchema))
    query: z.infer<typeof promotionListSchema>,
  ) {
    return this.organisations.listAllPromotions({
      page: query.page,
      limit: query.limit,
      status: query.status as PromotionStatus | undefined,
    });
  }

  @Roles("admin")
  @Patch("admin/promotions/:id")
  reviewPromotion(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(promotionReviewSchema))
    body: z.infer<typeof promotionReviewSchema>,
  ) {
    return this.organisations.reviewPromotion(
      requireUser(user).userId,
      params.id,
      { status: body.status, rejectionReason: body.rejectionReason },
    );
  }

  @Roles("admin")
  @Post("admin/promotions/:id/activate")
  activatePromotion(
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.organisations.activatePromotion(params.id);
  }
}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}
