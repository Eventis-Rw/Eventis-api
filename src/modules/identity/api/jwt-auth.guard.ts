import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  Injectable,
  type Type,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { AppError } from "../../../common/errors/app-error.js";
import { VerifyAccessTokenService } from "../application/verify-access-token.service.js";
import type { AccessTokenClaims } from "../application/verify-access-token.service.js";

export type AuthenticatedRequest = FastifyRequest & {
  auth?: AccessTokenClaims;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifyAccessToken: VerifyAccessTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw AppError.unauthenticated();
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw AppError.unauthenticated();
    }
    request.auth = await this.verifyAccessToken.execute(token);
    return true;
  }
}

export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.auth?.sub) {
      throw AppError.unauthenticated();
    }
    return request.auth.sub;
  },
);

export const JWT_AUTH_GUARD: Type<CanActivate> = JwtAuthGuard;
