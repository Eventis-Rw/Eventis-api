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
import {
  UpdateProfileService,
  updateProfileSchema,
  type UpdateProfileInput,
} from "../application/update-profile.service.js";
import { UserDevicesService } from "../application/user-devices.service.js";

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
    private readonly devices: UserDevicesService,
  ) {}

  @Patch("me")
  async patchMe(
    @CurrentUserId() userId: string,
    @Body(zodPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.updateProfile.execute(userId, body);
  }

  @Get("me/devices")
  async listDevices(@CurrentUserId() userId: string) {
    return this.devices.list(userId);
  }

  @Patch("me/devices/:deviceId")
  async updateDevice(
    @CurrentUserId() userId: string,
    @Param("deviceId") deviceId: string,
    @Body(zodPipe(deviceUpdateSchema)) body: z.infer<typeof deviceUpdateSchema>,
  ) {
    return this.devices.update(userId, deviceId, body);
  }

  @Delete("me/devices/:deviceId")
  async revokeDevice(
    @CurrentUserId() userId: string,
    @Param("deviceId") deviceId: string,
  ) {
    return this.devices.revoke(userId, deviceId);
  }
}
