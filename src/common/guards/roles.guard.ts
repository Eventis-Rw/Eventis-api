import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";

import { ROLES_KEY } from "../decorators/roles.decorator.js";
import { AppError } from "../errors/app-error.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    ) as string[] | undefined;

    if (requiredRoles === undefined || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const user = request.user;

    if (!user) {
      throw AppError.unauthenticated();
    }

    const hasRole = requiredRoles.some((role) =>
      user.roles.some((r) => r.toUpperCase() === role.toUpperCase()) ||
      user.role.toUpperCase() === role.toUpperCase(),
    );

    if (!hasRole) {
      throw AppError.forbidden(
        `Access restricted to users with role: ${requiredRoles.join(", ")}`,
      );
    }

    return true;
  }
}
