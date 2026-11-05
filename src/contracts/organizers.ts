import { z } from 'zod';

import { isoDateTime, phoneE164, uuid } from './primitives.js';

export const organizerStatus = z.enum([
  'draft',
  'pending_review',
  'verified',
  'rejected',
  'suspended',
]);
export type OrganizerStatus = z.infer<typeof organizerStatus>;

export const organizerApplication = z.object({
  legalName: z.string().trim().min(2).max(160),
  displayName: z.string().trim().min(2).max(80),
  contactPhone: phoneE164,
  contactEmail: z.email(),
  /** Rwanda Development Board TIN. Required before any payout can be made. */
  tin: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'TIN is nine digits')
    .optional(),
  description: z.string().trim().max(1000),
  /** Object keys returned by the presigned upload endpoint, never raw files. */
  documentKeys: z.array(z.string().min(1)).min(1).max(10),
});
export type OrganizerApplication = z.infer<typeof organizerApplication>;

export const organizerSummary = z.object({
  id: uuid,
  displayName: z.string(),
  logoUrl: z.url().nullable(),
  isVerified: z.boolean(),
});
export type OrganizerSummary = z.infer<typeof organizerSummary>;

/**
 * Admin-only. Note what is NOT in organizerSummary: verification notes, the TIN,
 * and the reviewer. Those are internal and must never reach a public client.
 */
export const organizerAdminDetail = organizerSummary.extend({
  legalName: z.string(),
  status: organizerStatus,
  contactPhone: phoneE164,
  contactEmail: z.email(),
  tin: z.string().nullable(),
  verificationNotes: z.string().nullable(),
  reviewedBy: uuid.nullable(),
  reviewedAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type OrganizerAdminDetail = z.infer<typeof organizerAdminDetail>;

export const organizerReviewDecision = z
  .object({
    decision: z.enum(['approve', 'reject']),
    /** Mandatory on reject. A rejection the applicant cannot act on is a support ticket. */
    reason: z.string().trim().min(10).max(500).optional(),
  })
  .refine((v) => v.decision === 'approve' || (v.reason?.length ?? 0) >= 10, {
    message: 'a rejection must include a reason the organizer can act on',
    path: ['reason'],
  });
export type OrganizerReviewDecision = z.infer<typeof organizerReviewDecision>;
