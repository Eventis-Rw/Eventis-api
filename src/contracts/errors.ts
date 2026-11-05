/**
 * Every error the API can return, as a stable machine-readable code.
 *
 * Clients switch on `code`, never on `message`. Messages are for humans and may be
 * reworded or translated at any time; codes are part of the contract and changing
 * one is a breaking change requiring a major version.
 */
export const ERROR_CODES = {
  // Transport and generic
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  IDEMPOTENCY_KEY_REUSED: 'IDEMPOTENCY_KEY_REUSED',
  APP_VERSION_UNSUPPORTED: 'APP_VERSION_UNSUPPORTED',

  // Identity
  OTP_INVALID: 'OTP_INVALID',
  OTP_EXPIRED: 'OTP_EXPIRED',
  OTP_TOO_MANY_ATTEMPTS: 'OTP_TOO_MANY_ATTEMPTS',
  OTP_SEND_THROTTLED: 'OTP_SEND_THROTTLED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REUSE_DETECTED: 'TOKEN_REUSE_DETECTED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',

  // Organizer
  ORGANIZER_NOT_VERIFIED: 'ORGANIZER_NOT_VERIFIED',
  ORGANIZER_SUSPENDED: 'ORGANIZER_SUSPENDED',

  // Catalog
  EVENT_NOT_PUBLISHED: 'EVENT_NOT_PUBLISHED',
  EVENT_ALREADY_STARTED: 'EVENT_ALREADY_STARTED',
  EVENT_CANCELLED: 'EVENT_CANCELLED',

  // Live
  LIVE_SESSION_CONFLICT: 'LIVE_SESSION_CONFLICT',

  // Commerce
  SOLD_OUT: 'SOLD_OUT',
  QUANTITY_EXCEEDS_LIMIT: 'QUANTITY_EXCEEDS_LIMIT',
  ORDER_EXPIRED: 'ORDER_EXPIRED',
  ORDER_ALREADY_PAID: 'ORDER_ALREADY_PAID',
  TICKET_ALREADY_CHECKED_IN: 'TICKET_ALREADY_CHECKED_IN',
  TICKET_INVALID_SIGNATURE: 'TICKET_INVALID_SIGNATURE',
  TICKET_WRONG_EVENT: 'TICKET_WRONG_EVENT',
  TICKET_REVOKED: 'TICKET_REVOKED',

  // Payments
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_TIMEOUT: 'PAYMENT_TIMEOUT',
  PAYMENT_INSUFFICIENT_FUNDS: 'PAYMENT_INSUFFICIENT_FUNDS',
  PAYMENT_STATUS_UNKNOWN: 'PAYMENT_STATUS_UNKNOWN',
  PAYMENT_PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** The one error envelope. Every non-2xx response has this shape, with no exceptions. */
export interface ApiError {
  code: ErrorCode;
  /** Human-readable, not for programmatic use, may be localized. */
  message: string;
  /** Field-level detail for VALIDATION_FAILED. */
  fields?: Record<string, string[]>;
  /** Correlates this response with the server logs. Always present. */
  requestId: string;
  /** Present on RATE_LIMITED and PAYMENT_TIMEOUT. */
  retryAfterSeconds?: number;
}
