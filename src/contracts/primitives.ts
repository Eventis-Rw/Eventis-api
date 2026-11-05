import { z } from 'zod';

export const uuid = z.uuid();
export const isoDateTime = z.iso.datetime({ offset: true });

/**
 * Phone numbers are stored and transmitted in E.164 and nothing else.
 * Normalization (0788… -> +250788…) happens once, at the identity boundary,
 * so that a number has exactly one representation in the system.
 */
export const phoneE164 = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, 'phone must be E.164, for example +250788123456');

export const rwandaPhone = phoneE164.refine(
  (v) => v.startsWith('+250'),
  'must be a Rwandan number starting +250',
);

/** Mask for logs and for any screen that does not need the full number. */
export function maskPhone(e164: string): string {
  if (e164.length < 7) return '***';
  return `${e164.slice(0, 5)}****${e164.slice(-3)}`;
}

export const slug = z
  .string()
  .min(3)
  .max(180)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase alphanumeric with single hyphens');

export const latitude = z.coerce.number().min(-90).max(90);
export const longitude = z.coerce.number().min(-180).max(180);

export const geoPoint = z.object({ lat: latitude, lng: longitude });
export type GeoPoint = z.infer<typeof geoPoint>;

/** Opaque to clients. Never parse it, never construct it, just send it back. */
export const cursor = z.string().min(1).max(512);

export const idempotencyKey = z.string().min(8).max(120);

export type Uuid = z.infer<typeof uuid>;
export type PhoneE164 = z.infer<typeof phoneE164>;
