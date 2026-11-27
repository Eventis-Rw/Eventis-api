import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { ConsoleAccess, Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { ChatManagementService } from "../application/chat-management.service.js";

const actorId = (actor: AuthenticatedUser | undefined) => {
  if (!actor) throw AppError.unauthenticated();
  return actor.userId;
};

const idParam = z.object({ id: z.string().uuid() });
const memberParam = z.object({ id: z.string().uuid(), userId: z.string().uuid() });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const listConversationsSchema = pageSchema.extend({
  type: z.enum(["DIRECT", "GROUP"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
  query: z.string().trim().max(120).optional(),
});
const statusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]),
  reason: z.string().trim().min(1).max(500),
});
const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) });
const transferSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
});
const reportsQuerySchema = z.object({
  status: z.enum(["OPEN", "UNDER_REVIEW", "REVIEWED", "ACTIONED", "DISMISSED"]).optional(),
});
const assignSchema = z.object({ assigneeId: z.string().uuid() });
const noteSchema = z.object({ note: z.string().trim().min(1).max(4000) });
const reportActionSchema = z.object({
  outcome: z.enum(["ACTIONED", "DISMISSED"]),
  reason: z.string().trim().min(1).max(500),
});

@Controller({ path: "admin/chat", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class ChatManagementController {
  constructor(private readonly chat: ChatManagementService) {}

  @ConsoleAccess("chat:analytics:view")
  @Get("overview")
  overview() {
    return this.chat.overview();
  }

  @ConsoleAccess("chat:view")
  @Get("conversations")
  listConversations(
    @Query(zodPipe(listConversationsSchema))
    query: z.infer<typeof listConversationsSchema>,
  ) {
    return this.chat.listConversations(query);
  }

  @ConsoleAccess("chat:view")
  @Get("conversations/:id")
  getConversation(@Param(zodPipe(idParam)) p: z.infer<typeof idParam>) {
    return this.chat.getConversation(p.id);
  }

  @ConsoleAccess("chat:groups:suspend")
  @Patch("conversations/:id/status")
  setConversationStatus(
    @Param(zodPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(zodPipe(statusSchema)) body: z.infer<typeof statusSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.chat.setConversationStatus(p.id, body.status, actorId(actor), body.reason);
  }

  @ConsoleAccess("chat:members:manage")
  @Post("conversations/:id/members/:userId/remove")
  @HttpCode(200)
  removeMember(
    @Param(zodPipe(memberParam)) p: z.infer<typeof memberParam>,
    @Body(zodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.chat.removeMember(p.id, p.userId, actorId(actor), body.reason);
  }

  @ConsoleAccess("chat:groups:manage")
  @Post("conversations/:id/transfer-ownership")
  @HttpCode(200)
  transferOwnership(
    @Param(zodPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(zodPipe(transferSchema)) body: z.infer<typeof transferSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.chat.transferOwnership(p.id, body.userId, actorId(actor), body.reason);
  }

  @ConsoleAccess("chat:reports:view")
  @Get("reports")
  listReports(
    @Query(zodPipe(reportsQuerySchema)) query: z.infer<typeof reportsQuerySchema>,
  ) {
    return this.chat.listReports(query);
  }

  @ConsoleAccess("chat:reports:manage")
  @Post("reports/:id/assign")
  @HttpCode(200)
  assignReport(
    @Param(zodPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(zodPipe(assignSchema)) body: z.infer<typeof assignSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.chat.assignReport(p.id, body.assigneeId, actorId(actor));
  }

  @ConsoleAccess("chat:reports:manage")
  @Post("reports/:id/notes")
  @HttpCode(200)
  addReportNote(
    @Param(zodPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(zodPipe(noteSchema)) body: z.infer<typeof noteSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.chat.addReportNote(p.id, body.note, actorId(actor));
  }

  @ConsoleAccess("chat:moderation:manage")
  @Post("reports/:id/action")
  @HttpCode(200)
  actionReport(
    @Param(zodPipe(idParam)) p: z.infer<typeof idParam>,
    @Body(zodPipe(reportActionSchema)) body: z.infer<typeof reportActionSchema>,
    @CurrentUser() actor: AuthenticatedUser | undefined,
  ) {
    return this.chat.actionReport(p.id, body.outcome, actorId(actor), body.reason);
  }
}
