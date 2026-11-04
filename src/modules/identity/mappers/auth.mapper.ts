import type { AuthSession, AuthTokens, SessionUser } from "@eventis/contracts";

import type { AccountType, User } from "../domain/user.js";

export type AuthRole = "admin" | "organizer_owner" | "customer";

export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    roles: toAuthRoles(user),
    createdAt: user.createdAt.toISOString(),
  };
}

export function toAuthRoles(user: User): AuthRole[] {
  const roles: AuthRole[] = [];
  if (user.role === "ADMIN") roles.push("admin");
  if (user.accountType === "POSTER") roles.push("organizer_owner");
  if (roles.length === 0) roles.push("customer");
  return roles;
}

export function toProfileResponse(user: User) {
  return {
    id: user.id,
    phone: user.phone,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    accountType: user.accountType,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    organizationName: user.organizationName,
    organizationDescription: user.organizationDescription,
    dateOfBirth: user.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    gender: user.gender,
    bio: user.bio,
    location: user.location,
    interestedIn: user.interestedIn,
    username: user.username,
    posterKind: user.posterKind,
    termsVersion: user.termsVersion,
    termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
    profileVisibility: user.profileVisibility,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toAuthTokens(input: {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}): AuthTokens {
  return {
    accessToken: input.accessToken,
    accessTokenExpiresAt: input.accessTokenExpiresAt.toISOString(),
    refreshToken: input.refreshToken,
    refreshTokenExpiresAt: input.refreshTokenExpiresAt.toISOString(),
  };
}

export function toAuthSession(input: {
  user: User;
  tokens: AuthTokens;
}): AuthSessionResponse {
  return {
    user: {
      ...toSessionUser(input.user),
      firstName: input.user.firstName,
      accountType: input.user.accountType,
    },
    tokens: input.tokens,
  };
}

export type AuthSessionResponse = AuthSession & {
  user: SessionUser & { firstName: string | null; accountType: AccountType };
};
