import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { UserRepository } from "../infrastructure/identity.repository.js";

@Injectable()
export class UserDevicesService {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  list(userId: string) {
    return this.users.findActiveDevicesByUserId(userId);
  }

  async update(
    userId: string,
    deviceId: string,
    input: {
      deviceName?: string | undefined;
      platform?: string | undefined;
      osVersion?: string | undefined;
      appVersion?: string | undefined;
    },
  ) {
    const updated = await this.users.updateDevice(userId, deviceId, {
      deviceName: input.deviceName ?? null,
      platform: input.platform ?? null,
      osVersion: input.osVersion ?? null,
      appVersion: input.appVersion ?? null,
    });
    if (!updated) throw AppError.notFound("Device");
    return updated;
  }

  async revoke(userId: string, deviceId: string) {
    const revoked = await this.users.revokeDevice(
      userId,
      deviceId,
      this.clock.now(),
    );
    if (!revoked) throw AppError.notFound("Device");
    return { revoked: true, deviceId };
  }
}
