import type { AuthSession, AuthTokens, SessionUser } from "@eventis/contracts";

import type { AccountType, User } from "../domain/user.js";

/**
 * Map domain User → SessionUser contract. Never return a Prisma row.
 * Roles default to customer until an RBAC module owns memberships.
 */
export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    roles: ["customer"],
    createdAt: user.createdAt.toISOString(),
  };
}

/** Safe profile projection. Never serialize the persistence entity itself. */
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
  deviceCredential?: string;
}): AuthSessionResponse {
  return {
    user: {
      ...toSessionUser(input.user),
      firstName: input.user.firstName,
      accountType: input.user.accountType,
    },
    tokens: input.tokens,
    ...(input.deviceCredential
      ? { deviceCredential: input.deviceCredential }
      : {}),
  };
}

export type AuthSessionResponse = AuthSession & {
  user: SessionUser & { firstName: string | null; accountType: AccountType };
};
