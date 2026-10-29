import { describe, expect, it } from "bun:test";

import { AppError } from "../errors/app-error.js";
import { RolesGuard } from "./roles.guard.js";

function contextFor(
  roles: string[],
  user?: { userId: string; role: string; roles: string[] },
) {
  const reflector = { getAllAndOverride: () => roles };
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

  it("rejects an authenticated user without the required role", () => {
    const { guard, context } = contextFor(["organizer_owner"], {
      userId: "11111111-1111-1111-1111-111111111111",
      role: "customer",
      roles: ["customer"],
    });
    expect(() => guard.canActivate(context)).toThrow(AppError);
  });
});
