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
  "chat:view",
  "chat:direct:view",
  "chat:groups:view",
  "chat:groups:manage",
  "chat:groups:suspend",
  "chat:groups:delete",
  "chat:members:manage",
  "chat:reports:view",
  "chat:reports:manage",
  "chat:moderation:manage",
  "chat:analytics:view",
] as const;

export type ConsolePermission = (typeof CONSOLE_PERMISSIONS)[number];
export const CONSOLE_PERMISSION_KEY = "consolePermission";
export const ConsoleAccess = (permission: ConsolePermission) =>
  SetMetadata(CONSOLE_PERMISSION_KEY, permission);
