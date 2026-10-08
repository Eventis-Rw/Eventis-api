export type UserStatus = "ACTIVE" | "INACTIVE";
export type AccountType = "POSTER" | "LOVE";

export interface User {
  readonly id: string;
  readonly phone: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly accountType: AccountType;
  readonly organizationName: string | null;
  readonly organizationDescription: string | null;
  readonly dateOfBirth: Date | null;
  readonly gender: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly interestedIn: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export const MAX_TRUSTED_DEVICES = 3;

export interface UserDevice {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string;
  readonly credentialHash: string;
  readonly deviceName: string | null;
  readonly platform: string | null;
  readonly osVersion: string | null;
  readonly appVersion: string | null;
  readonly lastSeenAt: Date | null;
  readonly revokedAt: Date | null;
  readonly metadata: Record<string, unknown> | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefreshSession {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly deviceId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedById: string | null;
  readonly createdAt: Date;
}

export type DeviceCheckResult =
  { kind: "register" } | { kind: "match" } | { kind: "mismatch" };

export function canRegisterTrustedDevice(activeCount: number): boolean {
  return activeCount < MAX_TRUSTED_DEVICES;
}

export function checkDeviceBinding(
  existing: UserDevice | null,
  deviceId: string,
  deviceCredential: string | undefined,
  pepper: string,
  secretMatches: (value: string, hash: string, pepper: string) => boolean,
): DeviceCheckResult {
  if (!existing) {
    return { kind: "register" };
  }

  if (
    existing.deviceId === deviceId &&
    deviceCredential &&
    secretMatches(deviceCredential, existing.credentialHash, pepper)
  ) {
    return { kind: "match" };
  }

  return { kind: "mismatch" };
}

export function isRefreshReusable(session: RefreshSession, now: Date): boolean {
  if (session.revokedAt !== null) return false;
  if (session.replacedById !== null) return false;
  if (now.getTime() >= session.expiresAt.getTime()) return false;
  return true;
}

export function isRefreshReuse(session: RefreshSession): boolean {
  return session.replacedById !== null || session.revokedAt !== null;
}
