import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AdminCatalogService } from "../../organisations/index.js";
import type { Command } from "../domain/admin-workspace.types.js";
import { AdminWorkspaceRepository } from "../infrastructure/admin-workspace.repository.js";
@Injectable()
export class AdminWorkspaceService {
  constructor(
    private readonly repository: AdminWorkspaceRepository,
    private readonly catalog: AdminCatalogService,
    private readonly clock: Clock,
  ) {}
  read() {
    return this.repository.read();
  }
  async command(
    input: { command: Command; revision: number; requestId: string },
    actorId: string,
  ) {
    const catalog = await this.catalog.read();
    return this.repository.command(
      input,
      actorId,
      catalog,
      catalog.revision,
      this.clock.now(),
    );
  }
}
