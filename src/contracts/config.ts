import { z } from 'zod';

/**
 * Fetched at app start, before anything else.
 *
 * Version skew is permanent: a user in Nyamirambo will be running a four-month-old
 * build and you cannot make them update. This endpoint is the lever that lets a
 * contract break safely — soft-prompt first, hard-block only when it truly must.
 */
export const remoteConfig = z.object({
  /** Below this, the app refuses to run and shows the store link. */
  minSupportedVersion: z.string(),
  /** Below this, the app nags but still works. */
  recommendedVersion: z.string(),
  /** Hard stop for everyone. Used during a migration or an incident. */
  maintenanceMode: z.boolean(),
  maintenanceMessage: z.string().nullable(),
  features: z.record(z.string(), z.boolean()),
  /** Seconds. The client honours this rather than hardcoding its own interval. */
  paymentPollIntervalSeconds: z.number().int().min(1).max(60),
});
export type RemoteConfig = z.infer<typeof remoteConfig>;

/** Sent by every client on every request, so the server can reason about skew. */
export const APP_VERSION_HEADER = 'x-app-version';
export const APP_PLATFORM_HEADER = 'x-app-platform';
export const REQUEST_ID_HEADER = 'x-request-id';
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
