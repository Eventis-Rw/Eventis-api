import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  AgeDocumentType,
  AgeVerificationStatus,
  LoveGender,
  LoveInterestedIn,
  LoveRelationshipGoal,
} from "@prisma/client";
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
import { FindLoveService } from "../application/findlove.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const ageVerificationSchema = z.object({
  documentType: z.enum(["NATIONAL_ID", "PASSPORT"]),
  frontKey: z.string().trim().min(1).max(500),
  backKey: z.string().trim().max(500).nullable().optional(),
  dateOfBirth: z.coerce.date().optional(),
  adultConfirmed: z.boolean(),
});
const ageVerificationListSchema = pageSchema.extend({
  status: z
    .enum(["PROCESSING", "MANUAL_REVIEW", "VERIFIED", "REJECTED", "FAILED"])
    .optional(),
});
const ageVerificationReviewSchema = z.object({
  status: z.enum(["MANUAL_REVIEW", "VERIFIED", "REJECTED", "FAILED"]),
  rejectionReason: z.string().trim().max(2000).nullable().optional(),
  dateOfBirth: z.coerce.date().optional(),
});
const profileSchema = z.object({
  username: z.string().trim().min(3).max(20),
  gender: z.enum(["MAN", "WOMAN", "PREFER_NOT_TO_SAY"]),
  interestedIn: z.enum(["WOMEN", "MEN", "EVERYONE"]),
  dateOfBirth: z.coerce.date(),
  country: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  neighborhood: z.string().trim().min(1).max(80),
  occupation: z.string().trim().max(120).nullable().optional(),
  bio: z.string().trim().max(160).nullable().optional(),
  interests: z.array(z.string().trim().min(1).max(30)).max(15).optional(),
  relationshipGoal: z
    .enum(["FRIENDSHIP", "LONG_TERM", "SHORT_TERM", "MARRIAGE", "CASUAL", "NOT_SURE"])
    .nullable()
    .optional(),
  lookingFor: z.string().trim().max(120).nullable().optional(),
  photoKeys: z.array(z.string().trim().min(1).max(500)).max(6).optional(),
});
const profilePatchSchema = profileSchema
  .omit({ username: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const photosSchema = z.object({
  photoKeys: z.array(z.string().trim().min(1).max(500)).max(6),
});
const discoverSchema = pageSchema.extend({
  country: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  gender: z.enum(["MAN", "WOMAN", "PREFER_NOT_TO_SAY"]).optional(),
  minAge: z.coerce.number().int().min(18).max(100).optional(),
  maxAge: z.coerce.number().int().min(18).max(100).optional(),
});
const likeSchema = z.object({ profileId: z.string().uuid() });
const connectionSchema = z.object({
  profileId: z.string().uuid(),
  message: z.string().trim().max(500).nullable().optional(),
});
const connectionListSchema = z.object({
  direction: z.enum(["incoming", "outgoing", "accepted"]).default("incoming"),
});
const connectionResponseSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED", "REMOVED"]),
});

@Controller({ path: "findlove", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class FindLoveController {
  constructor(private readonly findlove: FindLoveService) {}

  @Post("age-verification")
  submitAgeVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(ageVerificationSchema))
    body: z.infer<typeof ageVerificationSchema>,
  ) {
    return this.findlove.submitAgeVerification(requireUser(user).userId, {
      documentType: body.documentType as AgeDocumentType,
      frontKey: body.frontKey,
      backKey: body.backKey,
      dateOfBirth: body.dateOfBirth,
      adultConfirmed: body.adultConfirmed,
    });
  }

  @Get("age-verification")
  getAgeVerification(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.findlove.getAgeVerification(requireUser(user).userId);
  }

  @Roles("admin")
  @Get("admin/age-verifications")
  listAgeVerifications(
    @Query(zodPipe(ageVerificationListSchema))
    query: z.infer<typeof ageVerificationListSchema>,
  ) {
    return this.findlove.listAgeVerifications({
      page: query.page,
      limit: query.limit,
      status: query.status as AgeVerificationStatus | undefined,
    });
  }

  @Roles("admin")
  @Patch("admin/age-verifications/:id")
  reviewAgeVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(ageVerificationReviewSchema))
    body: z.infer<typeof ageVerificationReviewSchema>,
  ) {
    return this.findlove.reviewAgeVerification(
      requireUser(user).userId,
      params.id,
      {
        status: body.status,
        rejectionReason: body.rejectionReason,
        dateOfBirth: body.dateOfBirth,
      },
    );
  }

  @Get("profile")
  getProfile(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.findlove.getMyProfile(requireUser(user).userId);
  }

  @Post("profile")
  createProfile(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(profileSchema)) body: z.infer<typeof profileSchema>,
  ) {
    return this.findlove.createProfile(requireUser(user).userId, {
      ...body,
      gender: body.gender as LoveGender,
      interestedIn: body.interestedIn as LoveInterestedIn,
      relationshipGoal:
        body.relationshipGoal as LoveRelationshipGoal | null | undefined,
    });
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(profilePatchSchema))
    body: z.infer<typeof profilePatchSchema>,
  ) {
    return this.findlove.updateProfile(requireUser(user).userId, {
      ...body,
      gender: body.gender as LoveGender | undefined,
      interestedIn: body.interestedIn as LoveInterestedIn | undefined,
      relationshipGoal:
        body.relationshipGoal as LoveRelationshipGoal | null | undefined,
    });
  }

  @Put("profile/photos")
  replacePhotos(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(photosSchema)) body: z.infer<typeof photosSchema>,
  ) {
    return this.findlove.replacePhotos(
      requireUser(user).userId,
      body.photoKeys,
    );
  }

  @Get("discover")
  discover(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(discoverSchema)) query: z.infer<typeof discoverSchema>,
  ) {
    return this.findlove.discover(requireUser(user).userId, {
      ...query,
      gender: query.gender as LoveGender | undefined,
    });
  }

  @Get("profiles/:id")
  getProfileById(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.findlove.getProfileById(
      requireUser(user).userId,
      params.id,
    );
  }

  @Post("likes")
  @HttpCode(200)
  like(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(likeSchema)) body: z.infer<typeof likeSchema>,
  ) {
    return this.findlove.like(requireUser(user).userId, body.profileId);
  }

  @Post("connections")
  sendConnection(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(connectionSchema))
    body: z.infer<typeof connectionSchema>,
  ) {
    return this.findlove.sendConnection(requireUser(user).userId, body);
  }

  @Get("connections")
  listConnections(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(connectionListSchema))
    query: z.infer<typeof connectionListSchema>,
  ) {
    return this.findlove.listConnections(
      requireUser(user).userId,
      query.direction,
    );
  }

  @Patch("connections/:id")
  respondToConnection(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(connectionResponseSchema))
    body: z.infer<typeof connectionResponseSchema>,
  ) {
    return this.findlove.respondToConnection(
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
