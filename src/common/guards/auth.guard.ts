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
import { PrismaService } from "../../infrastructure/database/prisma.service.js";
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
  consolePermissions?: string[];
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
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const userId = payload?.userId ?? payload?.sub;
    if (!payload || !userId) {
      if (isPublic || isOptional) {
        return true;
      }
      throw AppError.unauthenticated("Invalid or expired authentication token");
    }

    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        phone: true,
        role: true,
        consoleRole: { select: { permissions: true } },
        accountType: true,
        status: true,
        deletedAt: true,
      },
    });
    if (!account || account.deletedAt || account.status !== "ACTIVE")
      throw AppError.unauthenticated("This account is no longer active");
    // Role and account restrictions take effect immediately, even for unexpired JWTs.
    const roles: string[] = [];
    const consolePermissions =
      account.role === "ADMIN" ? account.consoleRole?.permissions : undefined;
    if (account.role === "ADMIN" && !consolePermissions) roles.push("admin");
    if (account.accountType === "POSTER") roles.push("organizer_owner");
    if (!roles.length) roles.push("customer");
    request.user = {
      userId,
      phone: account.phone ?? "",
      role: roles[0]!,
      roles,
      ...(consolePermissions ? { consolePermissions } : {}),
    };

    return true;
  }
}
