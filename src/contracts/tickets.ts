import { z } from 'zod';

import { isoDateTime, uuid } from './primitives.js';

export const ticketStatus = z.enum(['issued', 'checked_in', 'void', 'refunded']);
export type TicketStatus = z.infer<typeof ticketStatus>;

export const ticket = z.object({
  id: uuid,
  orderId: uuid,
  eventId: uuid,
  eventTitle: z.string(),
  eventStartsAt: isoDateTime,
  venueName: z.string(),
  ticketTypeName: z.string(),
  holderName: z.string().nullable(),
  status: ticketStatus,
  /**
   * The signed QR payload, base64url. Contains a signature the scanner verifies
   * offline with the public key — it is not a lookup key, and it is not secret
   * in the sense of a password, but it IS a bearer token: whoever holds it enters.
   */
  qrPayload: z.string(),
  checkedInAt: isoDateTime.nullable(),
  issuedAt: isoDateTime,
});
export type Ticket = z.infer<typeof ticket>;

// ---------- Gate check-in ----------

export const checkInResult = z.enum([
  'ADMITTED',
  'ALREADY_USED',
  'WRONG_EVENT',
  'INVALID_SIGNATURE',
  'EXPIRED',
  'REVOKED',
]);
export type CheckInResult = z.infer<typeof checkInResult>;

export const checkInRequest = z.object({
  qrPayload: z.string().min(1),
  eventId: uuid,
  gate: z.string().trim().max(40).optional(),
  /**
   * When the scan physically happened, which is not when it reached the server.
   * A gate that was offline for an hour syncs with the real scan times.
   */
  scannedAt: z.coerce.date(),
  /** Idempotency for the offline sync queue: replaying a batch must not double-count. */
  clientScanId: z.string().min(8).max(64),
});
export type CheckInRequest = z.infer<typeof checkInRequest>;

export const checkInResponse = z.object({
  result: checkInResult,
  ticketId: uuid.nullable(),
  holderName: z.string().nullable(),
  ticketTypeName: z.string().nullable(),
  /** Set when the result is ALREADY_USED, so staff can see where it was first scanned. */
  firstCheckedInAt: isoDateTime.nullable(),
  firstCheckedInGate: z.string().nullable(),
});
export type CheckInResponse = z.infer<typeof checkInResponse>;

/** Offline scanners POST the whole queue. At-least-once, so the server dedupes on clientScanId. */
export const checkInSyncRequest = z.object({
  scans: z.array(checkInRequest).min(1).max(500),
});
export type CheckInSyncRequest = z.infer<typeof checkInSyncRequest>;

export const checkInSyncResponse = z.object({
  results: z.array(z.object({ clientScanId: z.string(), response: checkInResponse })),
});
export type CheckInSyncResponse = z.infer<typeof checkInSyncResponse>;

/**
 * What a scanner fetches before going offline: the Ed25519 public key and the
 * event window. Verification needs nothing else — no network at the gate.
 */
export const scannerBundle = z.object({
  eventId: uuid,
  eventTitle: z.string(),
  signingPublicKey: z.string(),
  keyVersion: z.number().int().min(1),
  validFrom: isoDateTime,
  validUntil: isoDateTime,
});
export type ScannerBundle = z.infer<typeof scannerBundle>;
