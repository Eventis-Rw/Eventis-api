import { Injectable } from "@nestjs/common";

import { ConsoleSettingsRepository } from "../infrastructure/console-settings.repository.js";

type Settings = {
  displayName: string;
  supportEmail: string | null;
  announcement: string | null;
  revision: number;
};

type RoleInput = { name: string; permissions: string[] };

@Injectable()
export class ConsoleSettingsService {
  constructor(private readonly settings: ConsoleSettingsRepository) {}

  async publicSettings() {
    const { displayName, supportEmail, announcement } =
      await this.settings.read();
    return { displayName, supportEmail, announcement };
  }

  read() {
    return this.settings.read();
  }

  save(body: Settings, actorId: string) {
    return this.settings.save(body, actorId);
  }

  listRoles() {
    return this.settings.listRoles();
  }

  saveRole(id: string | null, body: RoleInput, actorId: string) {
    return this.settings.saveRole(id, body, actorId);
  }

  deleteRole(id: string, actorId: string) {
    return this.settings.deleteRole(id, actorId);
  }

  assign(id: string, roleId: string | null, actorId: string) {
    return this.settings.assign(id, roleId, actorId);
  }
}
