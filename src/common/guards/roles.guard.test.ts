import { describe, expect, it } from "bun:test";

import { CONSOLE_PERMISSION_KEY } from "../decorators/roles.decorator.js";
import { AppError } from "../errors/app-error.js";

import { RolesGuard } from "./roles.guard.js";

function contextFor(
  roles: string[],
  user?: {
    userId: string;
    role: string;
    roles: string[];
    consolePermissions?: string[];
  },
  permission?: string,
) {
  const reflector = {
    getAllAndOverride: (key: string) =>
      key === CONSOLE_PERMISSION_KEY ? permission : roles,
  };
  const request = { user };
  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return {
    guard: new RolesGuard(reflector as never),
    context: context as never,
  };
}

describe("RolesGuard", () => {
  it("allows an authenticated organizer even when admin is the primary role", () => {
    const { guard, context } = contextFor(["organizer_owner"], {
      userId: "11111111-1111-1111-1111-111111111111",
      role: "admin",
      roles: ["admin", "organizer_owner"],
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("limits delegated administrators to the explicitly assigned console permissions", () => {
    const user = {
      userId: "delegated",
      role: "customer",
      roles: ["customer"],
      consolePermissions: ["users:read"],
    };
    const allowed = contextFor(["admin"], user, "users:read");
    const denied = contextFor(["admin"], user, "users:manage");
    const unrestrictedOnly = contextFor(["admin"], user);
    expect(allowed.guard.canActivate(allowed.context)).toBe(true);
    expect(() => denied.guard.canActivate(denied.context)).toThrow(AppError);
    expect(() =>
      unrestrictedOnly.guard.canActivate(unrestrictedOnly.context),
    ).toThrow(AppError);
  });

  it("rejects an authenticated user without the required role", () => {
    const { guard, context } = contextFor(["organizer_owner"], {
      userId: "11111111-1111-1111-1111-111111111111",
      role: "customer",
      roles: ["customer"],
    });
    expect(() => guard.canActivate(context)).toThrow(AppError);
  });
});
