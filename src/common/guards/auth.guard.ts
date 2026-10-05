import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { ENV, type Env } from "../../config/env.js";
import { verifyJwt } from "../auth/jwt.util.js";
import { AppError } from "../errors/app-error.js";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_OPTIONAL_AUTH_KEY = "isOptionalAuth";
export const OptionalAuth = () => SetMetadata(IS_OPTIONAL_AUTH_KEY, true);

export interface AuthenticatedUser {
  userId: string;
  phone?: string;
  role: string;
  roles: string[];
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const isOptional = this.reflector.getAllAndOverride<boolean>(
      IS_OPTIONAL_AUTH_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (isPublic || isOptional) {
        return true;
      }
      throw AppError.unauthenticated("Authentication required");
    }

    const token = authHeader.substring(7).trim();
    const payload = verifyJwt(token, this.env.JWT_ACCESS_SECRET);

    if (!payload || !payload.userId) {
      if (isPublic || isOptional) {
        return true;
      }
      throw AppError.unauthenticated("Invalid or expired authentication token");
    }

    const roles = payload.roles ?? (payload.role ? [payload.role] : ["customer"]);
    request.user = {
      userId: payload.userId,
      ...(payload.phone ? { phone: payload.phone } : {}),
      role: payload.role ?? roles[0] ?? "customer",
      roles,
    };

    return true;
  }
}
