import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { ModerationStatus } from "@prisma/client";
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
import { EngagementService } from "../application/engagement.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).nullable().optional(),
});
const reviewPatchSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    comment: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const reportSchema = z.object({
  reason: z.string().trim().min(1).max(200),
  details: z.string().trim().max(2000).nullable().optional(),
});
const reportListSchema = pageSchema.extend({
  status: z.enum(["OPEN", "REVIEWED", "DISMISSED"]).optional(),
});
const reportStatusSchema = z.object({
  status: z.enum(["OPEN", "REVIEWED", "DISMISSED"]),
});

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Post("events/:id/save")
  @HttpCode(200)
  saveEvent(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.engagement.saveEvent(requireUser(user).userId, params.id);
  }

  @Delete("events/:id/save")
  unsaveEvent(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.engagement.unsaveEvent(requireUser(user).userId, params.id);
  }

  @Get("me/saved-events")
  listSavedEvents(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.engagement.listSavedEvents(requireUser(user).userId, query);
  }

  @Post("organisations/:id/save")
  @HttpCode(200)
  saveOrganiser(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.engagement.saveOrganiser(requireUser(user).userId, params.id);
  }

  @Delete("organisations/:id/save")
  unsaveOrganiser(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.engagement.unsaveOrganiser(requireUser(user).userId, params.id);
  }

  @Get("me/saved-organisers")
  listSavedOrganisers(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.engagement.listSavedOrganisers(requireUser(user).userId, query);
  }

  @Public()
  @Get("events/:id/reviews")
  listReviews(
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Query(zodPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.engagement.listReviews(params.id, query);
  }

  @Post("events/:id/reviews")
  createReview(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(reviewSchema)) body: z.infer<typeof reviewSchema>,
  ) {
    return this.engagement.createReview(
      requireUser(user).userId,
      params.id,
      body,
    );
  }

  @Patch("reviews/:id")
  updateReview(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(reviewPatchSchema))
    body: z.infer<typeof reviewPatchSchema>,
  ) {
    return this.engagement.updateReview(
      requireUser(user).userId,
      params.id,
      body,
    );
  }

  @Delete("reviews/:id")
  deleteReview(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.engagement.deleteReview(requireUser(user).userId, params.id);
  }

  @Post("events/:id/reports")
  createReport(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(reportSchema)) body: z.infer<typeof reportSchema>,
  ) {
    return this.engagement.createEventReport(
      requireUser(user).userId,
      params.id,
      body,
    );
  }

  @Roles("admin")
  @Get("admin/event-reports")
  listReports(
    @Query(zodPipe(reportListSchema))
    query: z.infer<typeof reportListSchema>,
  ) {
    return this.engagement.listEventReports({
      page: query.page,
      limit: query.limit,
      status: query.status as ModerationStatus | undefined,
    });
  }

  @Roles("admin")
  @Patch("admin/event-reports/:id")
  updateReport(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(reportStatusSchema))
    body: z.infer<typeof reportStatusSchema>,
  ) {
    return this.engagement.updateEventReport(
      requireUser(user).userId,
      params.id,
      body.status,
    );
  }
}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}
