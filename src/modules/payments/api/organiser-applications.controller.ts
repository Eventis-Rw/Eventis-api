import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import { AuthGuard, type AuthenticatedUser } from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { OrganiserApplicationsService } from "../application/organiser-applications.service.js";

const application = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(20).max(1000),
  activities: z.string().trim().min(3).max(300),
  location: z.string().trim().min(2).max(120),
  website: z.string().trim().url().max(500).nullable().optional(),
});
const id = z.object({ id: z.string().uuid() });
const page = z.object({ page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) });
const decision = z.discriminatedUnion("status", [
  z.object({ status: z.literal("APPROVED") }),
  z.object({ status: z.literal("REJECTED"), rejectionReason: z.string().trim().min(1).max(1000) }),
]);

function actor(user: AuthenticatedUser | undefined) {
  if (!user) throw AppError.unauthenticated();
  return user.userId;
}

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class OrganiserApplicationsController {
  constructor(private readonly applications: OrganiserApplicationsService) {}

  @Get("me/organiser-application")
  async mine(@CurrentUser() user: AuthenticatedUser | undefined) {
    return { application: await this.applications.mine(actor(user)) };
  }

  @Post("organiser-applications")
  create(@CurrentUser() user: AuthenticatedUser | undefined, @Body(zodPipe(application)) body: z.infer<typeof application>) {
    return this.applications.create(actor(user), body);
  }

  @Roles("admin")
  @Get("admin/organiser-applications")
  list(@Query(zodPipe(page)) query: z.infer<typeof page>) {
    return this.applications.list(query.page, query.limit);
  }

  @Roles("admin")
  @Post("admin/organiser-applications/:id/review")
  review(@CurrentUser() user: AuthenticatedUser | undefined, @Param(zodPipe(id)) params: z.infer<typeof id>, @Body(zodPipe(decision)) body: z.infer<typeof decision>) {
    return this.applications.review(params.id, actor(user), body.status, body.status === "REJECTED" ? body.rejectionReason : undefined);
  }
}
