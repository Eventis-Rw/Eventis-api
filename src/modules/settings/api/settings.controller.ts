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
import { z } from "zod";

import {
  CurrentUser,
} from "../../../common/decorators/current-user.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { SettingsService } from "../application/settings.service.js";

const idParamSchema = z.object({ id: z.string().uuid() });
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
const preferenceSchema = z
  .object({
    preferredLocation: z.string().trim().max(120).nullable().optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    language: z.string().trim().min(2).max(10).nullable().optional(),
    categoryIds: z.array(z.string().uuid()).max(50).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const notificationPreferenceSchema = z
  .object({
    eventRecommendations: z.boolean().optional(),
    categoryUpdates: z.boolean().optional(),
    eventUpdates: z.boolean().optional(),
    savedOrganiserUpdates: z.boolean().optional(),
    promotional: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
const notificationsQuerySchema = pageSchema.extend({
  unreadOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  category: z
    .enum(["EVENTS", "ACTIVITY", "ORGANIZERS", "FINDLOVE", "SYSTEM"])
    .optional(),
});
const pushTokenSchema = z.object({
  token: z.string().trim().min(8).max(500),
  platform: z.enum(["IOS", "ANDROID"]),
});
const phoneVerificationSchema = z.object({
  phone: z.string().trim().min(1).max(30),
  purpose: z.enum(["SETTINGS", "PAYMENT", "CHAT"]).default("SETTINGS"),
});
const codeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
const deletionRequestSchema = z.object({
  channel: z.enum(["SMS", "EMAIL"]).default("SMS"),
});

@Controller({ version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get("me/preferences")
  getPreferences(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.settings.getPreferences(requireUser(user).userId);
  }

  @Patch("me/preferences")
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(preferenceSchema))
    body: z.infer<typeof preferenceSchema>,
  ) {
    return this.settings.updatePreferences(requireUser(user).userId, body);
  }

  @Get("me/notification-preferences")
  getNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.settings.getNotificationPreferences(requireUser(user).userId);
  }

  @Patch("me/notification-preferences")
  updateNotificationPreferences(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(notificationPreferenceSchema))
    body: z.infer<typeof notificationPreferenceSchema>,
  ) {
    return this.settings.updateNotificationPreferences(
      requireUser(user).userId,
      body,
    );
  }

  @Get("me/notifications")
  listNotifications(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(notificationsQuerySchema))
    query: z.infer<typeof notificationsQuerySchema>,
  ) {
    return this.settings.listNotifications(requireUser(user).userId, query);
  }

  @Patch("me/notifications/:id/read")
  markNotificationRead(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
  ) {
    return this.settings.markNotificationRead(
      requireUser(user).userId,
      params.id,
    );
  }

  @Post("me/notifications/read-all")
  @HttpCode(200)
  markAllNotificationsRead(
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.settings.markAllNotificationsRead(requireUser(user).userId);
  }

  @Post("me/push-tokens")
  @HttpCode(200)
  registerPushToken(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(pushTokenSchema)) body: z.infer<typeof pushTokenSchema>,
  ) {
    return this.settings.registerPushToken(requireUser(user).userId, body);
  }

  @Delete("me/push-tokens")
  removePushToken(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(z.object({ token: z.string().trim().min(8).max(500) })))
    body: { token: string },
  ) {
    return this.settings.removePushToken(requireUser(user).userId, body.token);
  }

  @Post("phone-verifications")
  requestPhoneVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(phoneVerificationSchema))
    body: z.infer<typeof phoneVerificationSchema>,
  ) {
    return this.settings.requestPhoneVerification(
      requireUser(user).userId,
      body,
    );
  }

  @Post("phone-verifications/:id/confirm")
  @HttpCode(200)
  confirmPhoneVerification(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(codeSchema)) body: z.infer<typeof codeSchema>,
  ) {
    return this.settings.confirmPhoneVerification(
      requireUser(user).userId,
      params.id,
      body.code,
    );
  }

  @Post("me/deletion-challenges")
  requestAccountDeletion(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(deletionRequestSchema))
    body: z.infer<typeof deletionRequestSchema>,
  ) {
    return this.settings.requestAccountDeletion(
      requireUser(user).userId,
      body.channel,
    );
  }

  @Post("me/deletion-challenges/:id/confirm")
  @HttpCode(200)
  confirmAccountDeletion(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParamSchema)) params: z.infer<typeof idParamSchema>,
    @Body(zodPipe(codeSchema)) body: z.infer<typeof codeSchema>,
  ) {
    return this.settings.confirmAccountDeletion(
      requireUser(user).userId,
      params.id,
      body.code,
    );
  }

  @Get("me/deletion-status")
  getDeletionStatus(@CurrentUser() user: AuthenticatedUser | undefined) {
    return this.settings.getAccountDeletionStatus(requireUser(user).userId);
  }
}

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}
