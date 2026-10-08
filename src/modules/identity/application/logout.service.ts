import { Injectable } from "@nestjs/common";
import type { LogoutRequest } from "@eventis/contracts";

import { Clock } from "../../../common/clock.js";
import { RefreshSessionRepository } from "../infrastructure/identity.repository.js";
import { TokenService } from "../infrastructure/token.service.js";

@Injectable()
export class LogoutService {
  constructor(
    private readonly sessions: RefreshSessionRepository,
    private readonly tokens: TokenService,
    private readonly clock: Clock,
  ) {}

  async execute(input: LogoutRequest): Promise<void> {
    const tokenHash = this.tokens.hashRefreshToken(input.refreshToken);
    const session = await this.sessions.findByTokenHash(tokenHash);
    if (!session) {
      return;
    }
    await this.sessions.revokeFamily(session.familyId, this.clock.now());
  }
}
