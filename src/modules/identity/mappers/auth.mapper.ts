import type { AuthSession, AuthTokens, SessionUser } from "@eventis/contracts";

import type { AccountType, User } from "../domain/user.js";


export function toSessionUser(user: User): SessionUser {
  return {
    id: user.id,
    phone: user.phone,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    roles: [
      ...(user.role === "ADMIN" ? (["admin"] as const) : []),
      ...(user.accountType === "POSTER"
        ? (["organizer_owner"] as const)
        : (["customer"] as const)),
    ],
    createdAt: user.createdAt.toISOString(),
  };
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
