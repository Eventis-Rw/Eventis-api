import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  HttpCode,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { AdminDashboardService } from "../application/admin-dashboard.service.js";
const params = z.object({ id: z.uuid() });
const photo = z
  .object({
    status: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(500),
  })
  .strict()
  .refine((v) => v.status !== "rejected" || v.reason.length >= 5, {
    message: "A rejection reason is required",
  });
const support = z
  .object({
    status: z.enum(["open", "in_progress", "resolved"]).optional(),
    reply: z.string().trim().min(1).max(5000).optional(),
    note: z.string().trim().min(1).max(5000).optional(),
    requestId: z.uuid(),
  })
  .strict()
  .refine((v) => [v.status, v.reply, v.note].filter(Boolean).length === 1, {
    message: "Choose one support action",
  });
const outcome = z
  .object({ outcome: z.enum(["resolved", "dismissed"]) })
  .strict();
const actorId = (actor: AuthenticatedUser | undefined) => {
  if (!actor) throw AppError.unauthenticated();
  return actor.userId;
};
@Controller({ path: "admin", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminDashboardController {
  constructor(private readonly dashboard: AdminDashboardService) {}
  @Get("findlove/photos") photos() {
    return this.dashboard.photos();
  }
  @Patch("findlove/photos/:id") moderate(
    @Param(zodPipe(params)) p: z.infer<typeof params>,
    @Body(zodPipe(photo)) b: z.infer<typeof photo>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.dashboard.moderate(p.id, b.status, b.reason, actorId(actor));
  }
  @Get("findlove/support") support() {
    return this.dashboard.support();
  }
  @Post("findlove/support/:id") @HttpCode(200) updateSupport(
    @Param(zodPipe(params)) p: z.infer<typeof params>,
    @Body(zodPipe(support)) b: z.infer<typeof support>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.dashboard.updateSupport({ id: p.id, ...b }, actorId(actor));
  }
  @Get("findlove/staff") staff() {
    return this.dashboard.staff();
  }
  @Get("findlove/notifications") notifications() {
    return this.dashboard.notifications();
  }
  @Post("findlove/notifications/:id/preview") @HttpCode(200) preview(
    @Param(zodPipe(z.object({ id: z.string().regex(/^[a-z_]{1,80}$/) })))
    p: { id: string },
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.dashboard.preview(p.id, actorId(actor));
  }
  @Get("audit-logs") audit() {
    return this.dashboard.audit();
  }
  @Get("reports") reports() {
    return this.dashboard.reports();
  }
  @Patch("reports/:id") resolve(
    @Param(zodPipe(params)) p: z.infer<typeof params>,
    @Body(zodPipe(outcome)) b: z.infer<typeof outcome>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.dashboard.resolve(p.id, b.outcome, actorId(actor));
  }
}
