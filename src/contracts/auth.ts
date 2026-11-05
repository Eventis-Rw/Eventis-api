import { z } from 'zod';

import { isoDateTime, phoneE164, uuid } from './primitives.js';

export const otpRequest = z.object({
  phone: phoneE164,
  /** Stable per install. Used for rate limiting, so it is required. */
  deviceId: z.string().min(8).max(128),
});
export type OtpRequest = z.infer<typeof otpRequest>;

export const otpRequestResponse = z.object({
  /** The client shows a countdown from this. The server, not the client, decides it. */
  retryAfterSeconds: z.number().int().min(0),
  expiresAt: isoDateTime,
});

export type OtpRequestResponse = z.infer<typeof otpRequestResponse>;

export const otpVerify = z.object({
  phone: phoneE164,
  code: z.string().regex(/^\d{6}$/, 'the code is six digits'),
  deviceId: z.string().min(8).max(128),
});
export type OtpVerify = z.infer<typeof otpVerify>;

export const userRole = z.enum([
  'customer',
  'organizer_owner',
  'organizer_staff',
  'gate_staff',
  'admin',
]);
export type UserRole = z.infer<typeof userRole>;

export const sessionUser = z.object({
  id: uuid,
  phone: phoneE164,
  displayName: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  roles: z.array(userRole),
  /** Null until the user completes profile setup. */
  createdAt: isoDateTime,
});
export type SessionUser = z.infer<typeof sessionUser>;

export const authTokens = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: isoDateTime,
  refreshToken: z.string(),
  refreshTokenExpiresAt: isoDateTime,
});
export type AuthTokens = z.infer<typeof authTokens>;

export const authSession = z.object({ user: sessionUser, tokens: authTokens });
export type AuthSession = z.infer<typeof authSession>;

export const refreshRequest = z.object({ refreshToken: z.string().min(1) });
export type RefreshRequest = z.infer<typeof refreshRequest>;

export const logoutRequest = z.object({ refreshToken: z.string().min(1) });
export type LogoutRequest = z.infer<typeof logoutRequest>;

export const profileUpdate = z.object({
  displayName: z.string().trim().min(2).max(60),
  email: z.email().optional(),
});
export type ProfileUpdate = z.infer<typeof profileUpdate>;
