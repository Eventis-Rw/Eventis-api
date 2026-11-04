import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { AnalyticsEventType } from "@prisma/client";
import { z } from "zod";

import {
  CurrentUser,
} from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  OptionalAuth,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { AnalyticsService } from "../application/analytics.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const recordSchema = z.object({
  type: z.enum([
    "IMPRESSION",
    "VIEW",
    "CLICK",
    "SAVE",
    "SHARE",
    "WEBSITE_CLICK",
  ]),
  source: z.string().trim().max(60).nullable().optional(),
});
const overviewSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  eventId: z.string().uuid().optional(),
});

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @OptionalAuth()
  @Post("events/:id/analytics")
  @HttpCode(200)
  record(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(recordSchema)) body: z.infer<typeof recordSchema>,
  ) {
    return this.analytics.record(params.id, {
      userId: user?.userId ?? null,
      type: body.type as AnalyticsEventType,
      source: body.source,
    });
  }

  @Roles("organizer_owner", "admin")
  @Get("me/analytics/overview")
  overview(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(overviewSchema)) query: z.infer<typeof overviewSchema>,
  ) {
    const to = query.to ?? new Date();
    const from =
      query.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    return this.analytics.overview(requireUser(user).userId, {
      from,
      to,
      eventId: query.eventId,
    });
  }
}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}
