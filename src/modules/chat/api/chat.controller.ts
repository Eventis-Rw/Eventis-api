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
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type {} from "@fastify/multipart";
import { z } from "zod";

import { AppError } from "../../../common/errors/app-error.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { CurrentUserId, JwtAuthGuard } from "../../identity/index.js";
import { ChatService } from "../application/chat.service.js";
import { CONTACT_SYNC_MAX } from "../domain/chat.js";

interface ChatUploadedFile {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  data: Buffer;
  content?: string | undefined;
  replyToId?: string | undefined;
  clientMessageId?: string | undefined;
  durationMs?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

const attachmentFieldsSchema = z.object({
  content: z.string().trim().max(4000).optional(),
  replyToId: z.string().uuid().optional(),
  clientMessageId: z.string().trim().min(1).max(80).optional(),
  durationMs: z.coerce.number().int().min(0).optional(),
  width: z.coerce.number().int().min(1).optional(),
  height: z.coerce.number().int().min(1).optional(),
});

const idSchema = z.string().uuid();
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const userSearchSchema = z.object({
  query: z.string().trim().max(33).optional().default(""),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const contactSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().max(100).optional(),
        phoneNumber: z.string().trim().min(1).max(40),
      }),
    )
    .max(CONTACT_SYNC_MAX),
});
const serviceSchema = z.enum(["FINDLOVE", "EVENTIS"]);
const createConversationSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(99),
  service: serviceSchema.optional(),
  contextId: z.string().uuid().nullable().optional(),
  type: z.enum(["DIRECT", "GROUP"]).optional(),
  title: z.string().trim().min(1).max(120).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  isPublic: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
});
const searchGroupsSchema = pageSchema.extend({
  query: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  service: serviceSchema.optional(),
});
const groupSettingsSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    category: z.string().trim().max(60).nullable().optional(),
    isPublic: z.boolean().optional(),
    requiresApproval: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const addMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(99),
});
const memberRoleSchema = z.object({
  role: z.enum(["ADMIN", "MEMBER"]),
});
const transferOwnershipSchema = z.object({
  userId: z.string().uuid(),
});
const joinByCodeSchema = z.object({
  inviteCode: z.string().trim().min(4).max(40),
});
const listConversationsSchema = pageSchema.extend({
  service: serviceSchema.optional(),
  archived: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});
const messagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  beforeId: z.string().uuid().optional(),
});
const sendMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  replyToId: z.string().uuid().optional(),
  clientMessageId: z.string().trim().min(1).max(80).optional(),
});
const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});
const createPollSchema = z.object({
  question: z.string().trim().min(1).max(300),
  options: z
    .array(z.string().trim().min(1).max(120))
    .min(2)
    .max(12)
    .refine(
      (options) => new Set(options.map((o) => o.toLowerCase())).size === options.length,
      "Poll options must be unique",
    ),
});
const pollVoteSchema = z.object({
  pollOptionId: z.string().uuid(),
});
const conversationSettingsSchema = z
  .object({
    isArchived: z.boolean().optional(),
    isMuted: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const deliveredSchema = z.object({
  messageId: z.string().uuid().optional(),
});
const invitationSchema = z.object({
  phoneNumber: z.string().trim().min(1).max(40),
  service: serviceSchema.optional(),
});
const updateAliasSchema = z.object({
  phoneNumber: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().max(100).optional(),
  newPhoneNumber: z.string().trim().min(1).max(40).optional(),
});
const blockSchema = z.object({
  userId: z.string().uuid(),
});
const reportCategorySchema = z.enum([
  "SPAM",
  "HARASSMENT",
  "IMPERSONATION",
  "INAPPROPRIATE_CONTENT",
  "OTHER",
]);
const reportSchema = z
  .object({
    userId: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(80),
    conversationId: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    category: reportCategorySchema.optional(),
    details: z.string().trim().max(2000).optional(),
  })
  .refine((value) => Boolean(value.userId || value.conversationId), {
    message: "Report a user, a conversation, or both",
    path: ["conversationId"],
  });
const connectionSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED", "CANCELLED"]),
});
const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
});
const createCallSchema = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(["VOICE", "VIDEO"]),
});
const updateCallSchema = z.object({
  status: z.enum(["ACCEPTED", "REJECTED", "MISSED", "CANCELLED", "ENDED"]),
});
const forwardSchema = z.object({
  conversationIds: z.array(z.string().uuid()).min(1).max(10),
});
const attachmentMetadataSchema = z
  .object({
    durationMs: z.coerce.number().int().min(0).nullable().optional(),
    width: z.coerce.number().int().min(1).nullable().optional(),
    height: z.coerce.number().int().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

@Controller({ path: "chat", version: "1" })
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post("contacts/sync")
  @HttpCode(200)
  syncContacts(
    @CurrentUserId() userId: string,
    @Body(zodPipe(contactSchema)) body: z.infer<typeof contactSchema>,
  ) {
    return this.chat.syncContacts(userId, body.contacts);
  }

  @Get("users/search")
  searchUsers(
    @CurrentUserId() userId: string,
    @Query(zodPipe(userSearchSchema)) query: z.infer<typeof userSearchSchema>,
  ) {
    return this.chat.searchUsers(userId, query);
  }

  @Post("conversations")
  createConversation(
    @CurrentUserId() userId: string,
    @Body(zodPipe(createConversationSchema))
    body: z.infer<typeof createConversationSchema>,
  ) {
    return this.chat.createConversation(userId, body);
  }

  @Get("contacts/aliases")
  listContactAliases(@CurrentUserId() userId: string) {
    return this.chat.listContactAliases(userId);
  }

  @Patch("contacts/aliases")
  updateContactAlias(
    @CurrentUserId() userId: string,
    @Body(zodPipe(updateAliasSchema))
    body: z.infer<typeof updateAliasSchema>,
  ) {
    return this.chat.updateContactAlias(userId, body);
  }

  @Get("conversations")
  listConversations(
    @CurrentUserId() userId: string,
    @Query(zodPipe(listConversationsSchema))
    query: z.infer<typeof listConversationsSchema>,
  ) {
    return this.chat.listConversations(userId, query);
  }

  @Get("conversations/:id")
  getConversation(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.getConversation(userId, id);
  }

  @Patch("conversations/:id/settings")
  updateConversationSettings(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(conversationSettingsSchema))
    body: z.infer<typeof conversationSettingsSchema>,
  ) {
    return this.chat.updateConversationSettings(userId, id, body);
  }

  @Get("groups/search")
  searchGroups(
    @CurrentUserId() userId: string,
    @Query(zodPipe(searchGroupsSchema)) query: z.infer<typeof searchGroupsSchema>,
  ) {
    return this.chat.searchGroups(userId, query);
  }

  @Post("groups/join-by-code")
  joinGroupByInviteCode(
    @CurrentUserId() userId: string,
    @Body(zodPipe(joinByCodeSchema)) body: z.infer<typeof joinByCodeSchema>,
  ) {
    return this.chat.joinGroupByInviteCode(userId, body.inviteCode);
  }

  @Post("conversations/:id/join")
  @HttpCode(200)
  joinGroup(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.joinGroup(userId, id);
  }

  @Post("conversations/:id/leave")
  @HttpCode(200)
  leaveGroup(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.leaveGroup(userId, id);
  }

  @Get("conversations/:id/requests")
  listJoinRequests(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.listJoinRequests(userId, id);
  }

  @Post("conversations/:id/requests/:requestUserId/approve")
  @HttpCode(200)
  approveJoinRequest(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Param("requestUserId", zodPipe(idSchema)) requestUserId: string,
  ) {
    return this.chat.approveJoinRequest(userId, id, requestUserId);
  }

  @Post("conversations/:id/requests/:requestUserId/reject")
  @HttpCode(200)
  rejectJoinRequest(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Param("requestUserId", zodPipe(idSchema)) requestUserId: string,
  ) {
    return this.chat.rejectJoinRequest(userId, id, requestUserId);
  }

  @Post("conversations/:id/participants")
  @HttpCode(200)
  addGroupMembers(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(addMembersSchema)) body: z.infer<typeof addMembersSchema>,
  ) {
    return this.chat.addGroupMembers(userId, id, body.userIds);
  }

  @Delete("conversations/:id/participants/:targetUserId")
  @HttpCode(200)
  removeGroupMember(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Param("targetUserId", zodPipe(idSchema)) targetUserId: string,
  ) {
    return this.chat.removeGroupMember(userId, id, targetUserId);
  }

  @Post("conversations/:id/participants/:targetUserId/ban")
  @HttpCode(200)
  banGroupMember(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Param("targetUserId", zodPipe(idSchema)) targetUserId: string,
  ) {
    return this.chat.setGroupMemberBan(userId, id, targetUserId, true);
  }

  @Post("conversations/:id/participants/:targetUserId/unban")
  @HttpCode(200)
  unbanGroupMember(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Param("targetUserId", zodPipe(idSchema)) targetUserId: string,
  ) {
    return this.chat.setGroupMemberBan(userId, id, targetUserId, false);
  }

  @Patch("conversations/:id/participants/:targetUserId/role")
  updateGroupMemberRole(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Param("targetUserId", zodPipe(idSchema)) targetUserId: string,
    @Body(zodPipe(memberRoleSchema)) body: z.infer<typeof memberRoleSchema>,
  ) {
    return this.chat.setGroupMemberRole(userId, id, targetUserId, body.role);
  }

  @Post("conversations/:id/transfer-ownership")
  @HttpCode(200)
  transferGroupOwnership(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(transferOwnershipSchema)) body: z.infer<typeof transferOwnershipSchema>,
  ) {
    return this.chat.transferGroupOwnership(userId, id, body.userId);
  }

  @Patch("conversations/:id/group")
  updateGroupSettings(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(groupSettingsSchema)) body: z.infer<typeof groupSettingsSchema>,
  ) {
    return this.chat.updateGroupSettings(userId, id, body);
  }

  @Post("conversations/:id/group/avatar")
  async updateGroupAvatar(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Req() req: FastifyRequest,
  ) {
    const file = await parseSingleFile(req, "file");
    return this.chat.updateGroupAvatar(userId, id, file);
  }

  @Get("conversations/:id/messages")
  listMessages(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Query(zodPipe(messagesQuerySchema))
    query: z.infer<typeof messagesQuerySchema>,
  ) {
    return this.chat.listMessages(userId, id, query);
  }

  @Post("conversations/:id/messages")
  sendMessage(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(sendMessageSchema)) body: z.infer<typeof sendMessageSchema>,
  ) {
    return this.chat.sendMessage(userId, id, body);
  }

  @Post("conversations/:id/messages/poll")
  createPoll(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(createPollSchema)) body: z.infer<typeof createPollSchema>,
  ) {
    return this.chat.createPoll(userId, id, body);
  }

  @Post("polls/:id/vote")
  votePoll(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(pollVoteSchema)) body: z.infer<typeof pollVoteSchema>,
  ) {
    return this.chat.votePoll(userId, id, body.pollOptionId);
  }

  @Delete("polls/:id/vote")
  @HttpCode(200)
  retractPollVote(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.retractPollVote(userId, id);
  }

  @Post("messages/:id/forward")
  forwardMessage(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(forwardSchema)) body: z.infer<typeof forwardSchema>,
  ) {
    return this.chat.forwardMessage(userId, id, body.conversationIds);
  }

  @Delete("conversations/:id")
  @HttpCode(200)
  clearConversation(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.clearConversation(userId, id);
  }

  @Post("conversations/:id/unhide")
  @HttpCode(200)
  unhideConversation(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.unhideConversation(userId, id);
  }

  @Patch("attachments/:id/metadata")
  updateAttachmentMetadata(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(attachmentMetadataSchema))
    body: z.infer<typeof attachmentMetadataSchema>,
  ) {
    return this.chat.updateAttachmentMetadata(userId, id, body);
  }

  @Post("conversations/:id/messages/attachments")
  async sendAttachment(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Req() req: FastifyRequest,
  ) {
    return this.chat.addAttachment(userId, id, await parseAttachment(req));
  }

  @Patch("messages/:id")
  editMessage(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(editMessageSchema)) body: z.infer<typeof editMessageSchema>,
  ) {
    return this.chat.editMessage(userId, id, body.content);
  }

  @Delete("messages/:id")
  @HttpCode(200)
  deleteMessage(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.deleteMessage(userId, id);
  }

  @Patch("conversations/:id/read")
  markRead(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.markRead(userId, id);
  }

  @Patch("conversations/:id/receipts/delivered")
  markDelivered(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(deliveredSchema)) body: z.infer<typeof deliveredSchema>,
  ) {
    return this.chat.markDelivered(userId, id, body.messageId);
  }

  @Get("attachments/:id/content")
  async downloadAttachment(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.chat.downloadAttachment(userId, id);
    const safeFileName = file.fileName.replace(/["\r\n]/g, "_");
    return reply
      .type(file.mimeType)
      .header("content-disposition", `attachment; filename="${safeFileName}"`)
      .header("cache-control", "private, no-store")
      .send(file.data);
  }

  @Post("invitations")
  createInvitation(
    @CurrentUserId() userId: string,
    @Body(zodPipe(invitationSchema)) body: z.infer<typeof invitationSchema>,
  ) {
    return this.chat.createInvitation(
      userId,
      body.phoneNumber,
      body.service,
    );
  }

  @Get("invitations")
  listInvitations(@CurrentUserId() userId: string) {
    return this.chat.listInvitations(userId);
  }

  @Post("invitations/accept")
  acceptInvitation(
    @CurrentUserId() userId: string,
    @Body(zodPipe(acceptInvitationSchema))
    body: z.infer<typeof acceptInvitationSchema>,
  ) {
    return this.chat.acceptInvitation(userId, body.token);
  }

  @Post("calls")
  createCall(
    @CurrentUserId() userId: string,
    @Body(zodPipe(createCallSchema)) body: z.infer<typeof createCallSchema>,
  ) {
    return this.chat.createCall(userId, body.conversationId, body.type);
  }

  @Get("calls/ice-servers")
  getCallIceServers(@CurrentUserId() userId: string) {
    return this.chat.getCallIceServers(userId);
  }

  @Patch("calls/:id")
  updateCall(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(updateCallSchema)) body: z.infer<typeof updateCallSchema>,
  ) {
    return this.chat.transitionCall(userId, id, body.status);
  }

  @Get("calls/history")
  listCalls(
    @CurrentUserId() userId: string,
    @Query(zodPipe(pageSchema.extend({ service: serviceSchema.optional() })))
    query: z.infer<typeof pageSchema> & { service?: "FINDLOVE" | "EVENTIS" },
  ) {
    return this.chat.listCalls(userId, query);
  }

  @Get("calls/:id")
  getCall(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.getCall(userId, id);
  }

  @Get("blocks")
  listBlocks(@CurrentUserId() userId: string) {
    return this.chat.listBlockedUsers(userId);
  }

  @Post("blocks")
  @HttpCode(200)
  blockUser(
    @CurrentUserId() userId: string,
    @Body(zodPipe(blockSchema)) body: z.infer<typeof blockSchema>,
  ) {
    return this.chat.blockUser(userId, body.userId);
  }

  @Delete("blocks/:id")
  @HttpCode(200)
  unblockUser(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
  ) {
    return this.chat.unblockUser(userId, id);
  }

  @Post("reports")
  @HttpCode(201)
  reportUser(
    @CurrentUserId() userId: string,
    @Body(zodPipe(reportSchema)) body: z.infer<typeof reportSchema>,
  ) {
    return this.chat.reportUser(userId, body);
  }

  @Patch("conversations/:id/connection")
  updateConnection(
    @CurrentUserId() userId: string,
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(connectionSchema)) body: z.infer<typeof connectionSchema>,
  ) {
    return this.chat.updateConnection(userId, id, body.status);
  }
}

async function parseAttachment(req: FastifyRequest): Promise<ChatUploadedFile> {
  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data")) {
    throw AppError.validation({
      file: ["Upload an attachment using multipart/form-data"],
    });
  }
  let file: ChatUploadedFile | undefined;
  const fields: Record<string, string> = {};
  try {
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (file || part.fieldname !== "file") {
          throw AppError.validation({
            file: ["Upload one attachment using the file field"],
          });
        }
        file = {
          fieldname: part.fieldname,
          filename: part.filename,
          encoding: part.encoding,
          mimetype: part.mimetype,
          data: await part.toBuffer(),
        };
      } else if (typeof part.value === "string") {
        if (!(part.fieldname in attachmentFieldsSchema.shape)) {
          throw AppError.validation({
            file: ["Only the file field and message details are accepted"],
          });
        }
        fields[part.fieldname] = part.value;
      } else {
        throw AppError.validation({
          file: ["Only the file field and message details are accepted"],
        });
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "FST_REQ_FILE_TOO_LARGE" ||
        error.code === "FST_FILES_LIMIT")
    ) {
      throw AppError.validation({
        file: ["Upload one file no larger than 15 MiB"],
      });
    }
    throw error;
  }
  if (!file)
    throw AppError.validation({ file: ["An attachment file is required"] });
  const details = attachmentFieldsSchema.safeParse(fields);
  if (!details.success) {
    throw AppError.validation({
      message: details.error.issues.map((issue) => issue.message),
    });
  }
  return { ...file, ...details.data };
}

interface SimpleUploadedFile {
  mimetype: string;
  filename: string;
  data: Buffer;
}

async function parseSingleFile(
  req: FastifyRequest,
  fieldname: string,
): Promise<SimpleUploadedFile> {
  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data")) {
    throw AppError.validation({ file: ["Upload a file using multipart/form-data"] });
  }
  let file: SimpleUploadedFile | undefined;
  try {
    for await (const part of req.parts()) {
      if (part.type === "file" && part.fieldname === fieldname && !file) {
        file = {
          mimetype: part.mimetype,
          filename: part.filename,
          data: await part.toBuffer(),
        };
      }
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error.code === "FST_REQ_FILE_TOO_LARGE" || error.code === "FST_FILES_LIMIT")
    ) {
      throw AppError.validation({ file: ["Upload one file no larger than 15 MiB"] });
    }
    throw error;
  }
  if (!file) throw AppError.validation({ file: [`A ${fieldname} file is required`] });
  return file;
}
