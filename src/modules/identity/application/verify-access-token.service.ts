import { Injectable } from "@nestjs/common";

import type { AccessTokenClaims } from "../infrastructure/token.service.js";
import { TokenService } from "../infrastructure/token.service.js";

export type { AccessTokenClaims };

@Injectable()
export class VerifyAccessTokenService {
  constructor(private readonly tokens: TokenService) {}

  execute(token: string): Promise<AccessTokenClaims> {
    return this.tokens.verifyAccessToken(token);
  }
}
