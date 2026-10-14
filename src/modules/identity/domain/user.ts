export type UserStatus = "ACTIVE" | "INACTIVE";
export type UserRole = "CUSTOMER" | "ADMIN";
export type AccountType = "POSTER" | "CUSTOMER" | "LOVE";

export interface User {
  readonly id: string;
  readonly phone: string;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly accountType: AccountType;
  readonly role: UserRole;
  readonly organizationName: string | null;
  readonly organizationDescription: string | null;
  readonly dateOfBirth: Date | null;
  readonly gender: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly interestedIn: string | null;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly pinHash: string | null;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RefreshSession {
  readonly id: string;
  readonly userId: string;
  readonly familyId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly replacedById: string | null;
  readonly createdAt: Date;
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
