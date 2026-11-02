import {
  Body,
  Controller,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type {} from "@fastify/multipart";

import { AppError } from "../../../common/errors/app-error.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import {
  UpdateProfileService,
  updateProfileSchema,
} from "../application/update-profile.service.js";

import { CurrentUserId, JwtAuthGuard } from "./jwt-auth.guard.js";

const nullableProfileFields = new Set([
  "lastName",
  "displayName",
  "email",
  "organizationName",
  "organizationDescription",
  "dateOfBirth",
  "gender",
  "bio",
  "location",
  "interestedIn",
]);

interface ProfileAvatarFile {
  filename: string;
  mimetype: string;
  data: Buffer;
}

@Controller({ path: "users", version: "1" })
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly updateProfile: UpdateProfileService,
  ) {}

  @Patch("me")
  async patchMe(
    @CurrentUserId() userId: string,
    @Req() req: FastifyRequest,
    @Body() body: unknown,
  ) {
    const { fields, avatarFile } = await this.resolveProfilePayload(req, body);
    const input = zodPipe(updateProfileSchema).transform(fields);
    return this.updateProfile.execute(userId, input, avatarFile);
  }

  private async resolveProfilePayload(
    req: FastifyRequest,
    body: unknown,
  ): Promise<{
    fields: Record<string, unknown>;
    avatarFile?: ProfileAvatarFile;
  }> {
    const contentType = req.headers["content-type"] ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return {
        fields: typeof body === "object" && body !== null
          ? (body as Record<string, unknown>)
          : {},
      };
    }

    const fields: Record<string, unknown> = {};
    let avatarFile: ProfileAvatarFile | undefined;
    for await (const part of req.parts()) {
      if (part.type === "file") {
        if (part.fieldname !== "avatar_image" || avatarFile) {
          throw AppError.validation({
            avatar_image: ["Upload one image using the avatar_image field"],
          });
        }
        avatarFile = {
          filename: part.filename,
          mimetype: part.mimetype,
          data: await part.toBuffer(),
        };
        continue;
      }

      if (part.value === "" || part.value === undefined) continue;
      if (part.value === "null" && nullableProfileFields.has(part.fieldname)) {
        fields[part.fieldname] = null;
      } else {
        fields[part.fieldname] = part.value;
      }
    }

    return { fields, ...(avatarFile ? { avatarFile } : {}) };
  }
}
