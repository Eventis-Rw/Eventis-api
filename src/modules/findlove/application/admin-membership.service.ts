import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import type { Command } from "../domain/admin-membership.js";
import { AdminMembershipRepository } from "../infrastructure/admin-membership.repository.js";
@Injectable()
export class AdminMembershipService {
  constructor(
    private readonly repository: AdminMembershipRepository,
    private readonly clock: Clock,
  ) {}
  read() {
    return this.repository.read();
  }
  command(
    input: { command: Command; revision: number; requestId: string },
    actorId: string,
  ) {
    return this.repository.command(input, actorId, this.clock.now());
  }
}
