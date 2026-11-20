import {
  Body,
  Controller,
  Get,
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
import type { SupportCategory, SupportStatus, UploadPurpose } from "@prisma/client";
import { z } from "zod";

import {
  CurrentUser,
} from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { SupportService } from "../application/support.service.js";

interface UploadedFile {
  filename: string;
  mimetype: string;
  data: Buffer;
}

const idParamSchema = z.object({ id: z.string().uuid() });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const uploadPurposeSchema = z.enum([
  "VERIFICATION_DOC",
  "SUPPORT_SCREENSHOT",
  "ORG_LOGO",
  "EVENT_IMAGE",
  "LOVE_PHOTO",
  "AGE_ID",
]);
const supportReportSchema = z.object({
  category: z.enum(["EVENTS", "PAYMENTS", "ACCOUNT", "SAFETY", "BUG", "OTHER"]),
  description: z.string().trim().min(10).max(5000),
  contactEmail: z.string().trim().email().max(255),
  reference: z.string().trim().max(80).nullable().optional(),
  screenshotKey: z.string().trim().max(500).nullable().optional(),
  diagnostics: z.record(z.string(), z.unknown()).optional(),
});
const supportListSchema = pageSchema.extend({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
});
const supportStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]),
});

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post("uploads")
  async upload(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Req() req: FastifyRequest,
  ) {
    const actor = requireUser(user);
    const { purpose, file } = await parseUpload(req);
    return this.support.upload(actor.userId, { purpose, file });
  }

  @Get("uploads/:id/file")
  async download(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Res() reply: FastifyReply,
  ) {
    const actor = requireUser(user);
    const file = await this.support.download(
      actor.userId,
      params.id,
      actor.roles.includes("admin") || actor.role === "admin",
    );
    reply
      .header("content-type", file.contentType)
      .header("cache-control", "private, no-store")
      .send(file.data);
  }

  @Post("support-reports")
  createReport(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(supportReportSchema))
    body: z.infer<typeof supportReportSchema>,
  ) {
    return this.support.createReport(requireUser(user).userId, {
      category: body.category as SupportCategory,
      description: body.description,
      contactEmail: body.contactEmail,
      reference: body.reference,
      screenshotKey: body.screenshotKey,
      diagnostics: body.diagnostics,
    });
  }

  @Get("me/support-reports")
  listMine(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(pageSchema)) query: z.infer<typeof pageSchema>,
  ) {
    return this.support.listMine(requireUser(user).userId, query);
  }

  @Roles("admin")
  @Get("admin/support-reports")
  listAll(
    @Query(zodPipe(supportListSchema))
    query: z.infer<typeof supportListSchema>,
  ) {
    return this.support.listAll({
      page: query.page,
      limit: query.limit,
      status: query.status as SupportStatus | undefined,
    });
  }

  @Roles("admin")
  @Patch("admin/support-reports/:id")
  updateStatus(
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(supportStatusSchema))
    body: z.infer<typeof supportStatusSchema>,
  ) {
    return this.support.updateStatus(params.id, body.status);
  }
}

async function parseUpload(
  req: FastifyRequest,
): Promise<{ purpose: UploadPurpose; file: UploadedFile }> {
  if (!req.headers["content-type"]?.includes("multipart/form-data")) {
    throw AppError.validation({
      file: ["Upload the file as multipart/form-data"],
    });
  }
  let purpose: UploadPurpose | null = null;
  let file: UploadedFile | null = null;
  for await (const part of req.parts()) {
    if (part.type === "file") {
      if (file) {
        throw AppError.validation({ file: ["Only one file may be uploaded"] });
      }
      file = {
        filename: part.filename,
        mimetype: part.mimetype,
        data: await part.toBuffer(),
      };
    } else if (part.fieldname === "purpose") {
      const parsed = uploadPurposeSchema.safeParse(part.value);
      if (!parsed.success) {
        throw AppError.validation({
          purpose: parsed.error.issues.map((issue) => issue.message),
        });
      }
      purpose = parsed.data;
    }
  }
  if (!file) throw AppError.validation({ file: ["Choose a file to upload"] });
  if (!purpose) {
    throw AppError.validation({ purpose: ["Choose an upload purpose"] });
  }
  return { purpose, file };
}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}
