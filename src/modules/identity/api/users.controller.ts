import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { Clock } from "../../../common/clock.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import {
  UpdateProfileService,
  updateProfileSchema,
  type UpdateProfileInput,
} from "../application/update-profile.service.js";
import { CurrentUserId, JwtAuthGuard } from "./jwt-auth.guard.js";

const deviceUpdateSchema = z.object({
  deviceName: z.string().trim().min(1).max(255).optional(),
  platform: z.string().trim().min(1).max(50).optional(),
  osVersion: z.string().trim().min(1).max(80).optional(),
  appVersion: z.string().trim().min(1).max(80).optional(),
});

@Controller({ path: "users", version: "1" })
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly updateProfile: UpdateProfileService,
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) { }

  @Patch("me")
  async patchMe(
    @CurrentUserId() userId: string,
    @Body(zodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.updateProfile.execute(userId, body);
  }

  @Get("me/devices")
  async listDevices(@CurrentUserId() userId: string) {
    return this.users.findActiveDevicesByUserId(userId);
  }

  @Patch("me/devices/:deviceId")
  async updateDevice(
    @CurrentUserId() userId: string,
    @Param("deviceId") deviceId: string,
    @Body(zodPipe(deviceUpdateSchema)) body: z.infer<typeof deviceUpdateSchema>,
  ) {
    const updated = await this.users.updateDevice(userId, deviceId, {
      deviceName: body.deviceName ?? null,
      platform: body.platform ?? null,
      osVersion: body.osVersion ?? null,
      appVersion: body.appVersion ?? null,
    });
    if (!updated) {
      throw new Error("Device not found");
    }
    return updated;
  }

  @Delete("me/devices/:deviceId")
  async revokeDevice(
    @CurrentUserId() userId: string,
    @Param("deviceId") deviceId: string,
  ) {
    const revoked = await this.users.revokeDevice(userId, deviceId, this.clock.now());
    if (!revoked) {
      throw new Error("Device not found");
    }
    return { revoked: true, deviceId };
  }
}
