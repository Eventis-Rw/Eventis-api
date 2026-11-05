import { z } from 'zod';

import { currency, moneyWire } from './money.js';
import { isoDateTime, phoneE164, uuid } from './primitives.js';

export const orderStatus = z.enum([
  'pending',
  'awaiting_payment',
  'paid',
  'cancelled',
  'expired',
  'refunded',
]);
export type OrderStatus = z.infer<typeof orderStatus>;

/**
 * The payment state machine, verbatim from the system design.
 *
 * `unknown` is a real state, not an error. Mobile money times out constantly and a
 * payment in `unknown` is NEVER retried blindly — it moves to `reconciling` and gets
 * its truth from the provider. Skipping that is how people get double-charged.
 */
export const paymentStatus = z.enum([
  'created',
  'provider_requested',
  'awaiting_user',
  'unknown',
  'reconciling',
  'succeeded',
  'failed',
  'expired',
]);
export type PaymentStatus = z.infer<typeof paymentStatus>;

/** A status the client can stop polling on. Everything else means keep waiting. */
export const TERMINAL_PAYMENT_STATUSES = ['succeeded', 'failed', 'expired'] as const;
export function isTerminalPaymentStatus(s: PaymentStatus): boolean {
  return (TERMINAL_PAYMENT_STATUSES as readonly string[]).includes(s);
}

export const orderLineInput = z.object({
  ticketTypeId: uuid,
  quantity: z.number().int().min(1).max(20),
});

export const createOrderRequest = z.object({
  eventId: uuid,
  lines: z.array(orderLineInput).min(1).max(10),
});
export type CreateOrderRequest = z.infer<typeof createOrderRequest>;

export const orderLine = z.object({
  ticketTypeId: uuid,
  ticketTypeName: z.string(),
  quantity: z.number().int().min(1),
  unitPriceMinor: moneyWire,
  subtotalMinor: moneyWire,
});

export const order = z.object({
  id: uuid,
  eventId: uuid,
  eventTitle: z.string(),
  status: orderStatus,
  lines: z.array(orderLine),
  subtotalMinor: moneyWire,
  feeMinor: moneyWire,
  totalMinor: moneyWire,
  currency,
  /** When the inventory hold lapses. Null for a free order. Clients show a countdown. */
  expiresAt: isoDateTime.nullable(),
  createdAt: isoDateTime,
});
export type Order = z.infer<typeof order>;

export const payOrderRequest = z.object({
  /** Prefilled from the account but editable — people pay from a different number. */
  payerPhone: phoneE164,
  provider: z.enum(['momo', 'airtel']).default('momo'),
});
export type PayOrderRequest = z.infer<typeof payOrderRequest>;

/**
 * What the checkout screen polls.
 *
 * The client NEVER decides it succeeded. It polls this until `isTerminal`, and the
 * server is the only authority on whether tickets were issued.
 */
export const orderPaymentState = z.object({
  orderId: uuid,
  orderStatus,
  paymentStatus,
  isTerminal: z.boolean(),
  /** Safe to show the user. Null while still in progress. */
  failureReason: z.string().nullable(),
  /** Populated only once orderStatus is 'paid'. */
  ticketIds: z.array(uuid),
  /** How long the client should wait before polling again. The server sets the backoff. */
  pollAfterSeconds: z.number().int().min(1).max(60),
});
export type OrderPaymentState = z.infer<typeof orderPaymentState>;
