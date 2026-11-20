import { moneyWire } from "@eventis/contracts";
import { z } from "zod";

const accountType = z.enum(["private", "public"]);
const paymentMethod = z.enum(["mtn_momo", "airtel_money"]);
const publicPaymentStatus = z.enum([
  "pending",
  "succeeded",
  "failed",
  "cancelled",
  "expired",
  "unknown",
]);

export const initiatePaymentDto = z
  .object({
    account_type: accountType,
    installment_id: z.uuid(),
    payment_method: paymentMethod,
    phone_number: z.string().trim().min(9).max(20),
  })
  .strict();

export const listPaymentsDto = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: publicPaymentStatus.optional(),
  account_type: accountType.optional(),
  payment_method: paymentMethod.optional(),
});

export const updateAccountTypeDto = z
  .object({
    account_type: accountType,
  })
  .strict();

export const paymentWebhookDto = z.object({
  event_id: z.string().trim().min(1).max(160),
  event_type: z.string().trim().min(1).max(80).optional(),
  payment_id: z.string().trim().min(1).max(64),
  status: z.enum(["pending", "succeeded", "failed", "cancelled", "unknown"]),
  amount_minor: moneyWire.optional(),
  currency: z.literal("RWF").optional(),
  provider_transaction_id: z.string().trim().min(1).max(128).optional(),
  message: z.string().trim().max(500).optional(),
});

export type InitiatePaymentDto = z.infer<typeof initiatePaymentDto>;
export type ListPaymentsDto = z.infer<typeof listPaymentsDto>;
export type UpdateAccountTypeDto = z.infer<typeof updateAccountTypeDto>;
export type PaymentWebhookDto = z.infer<typeof paymentWebhookDto>;
