import { SetMetadata } from "@nestjs/common";

export const ROLES_KEY = "roles";
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export const CONSOLE_PERMISSIONS = [
  "users:read",
  "users:manage",
  "events:read",
  "catalog:manage",
  "installments:manage",
  "reports:manage",
  "audit:read",
  "findlove:manage",
  "organisers:verify",
  "promotions:manage",
  "subscriptions:activate",
  "settings:manage",
] as const;

export type ConsolePermission = (typeof CONSOLE_PERMISSIONS)[number];
export const CONSOLE_PERMISSION_KEY = "consolePermission";
export const ConsoleAccess = (permission: ConsolePermission) =>
  SetMetadata(CONSOLE_PERMISSION_KEY, permission);
