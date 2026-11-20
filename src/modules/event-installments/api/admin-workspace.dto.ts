import { z } from "zod";
const value = z.number().finite().min(0).max(1e9),
  reason = z.string().trim().min(1).max(1000);
const terms = z
  .object({
    frequency: z.enum(["weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1).max(52),
    installment_count: z.number().int().min(1).max(120),
    initial_payment: value,
    interest: z.number().finite().min(0).max(100),
    late_fee: value,
    grace_period_days: z.number().int().min(0).max(365),
    partial_payment: z.boolean(),
    early_payment: z.boolean(),
  })
  .strict();
export const adminInstallmentCommand = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("save_plan"),
      id: z.uuid().optional(),
      name: z.string().trim().min(1).max(120),
      description: z.string().max(2000),
      terms,
    })
    .strict(),
  z.object({ type: z.literal("toggle_plan"), id: z.uuid() }).strict(),
  z
    .object({
      type: z.literal("assign"),
      customer_id: z.uuid(),
      plan_id: z.uuid().nullable(),
      product_id: z.string().max(100).nullable(),
      product_name: z.string().max(200),
      quantity: z.number().int().min(1).max(100),
      total_amount: value.positive(),
      currency: z.string().regex(/^[A-Z]{3}$/),
      start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      terms,
    })
    .strict(),
  z
    .object({
      type: z.literal("revise"),
      agreement_id: z.uuid(),
      new_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      new_installment_count: z.number().int().min(1).max(120),
      reason,
    })
    .strict(),
  z
    .object({ type: z.literal("cancel"), agreement_id: z.uuid(), reason })
    .strict(),
  z
    .object({
      type: z.literal("pay"),
      agreement_id: z.uuid(),
      schedule_id: z.uuid(),
      amount: value.positive(),
      payment_method: z.string().trim().min(1).max(100),
      transaction_reference: z.string().trim().min(1).max(128),
    })
    .strict(),
  z
    .object({
      type: z.literal("refund"),
      payment_id: z.uuid(),
      amount: value.positive(),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("due_date"),
      schedule_id: z.uuid(),
      new_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("fee"),
      schedule_id: z.uuid(),
      fee_type: z.enum(["fixed", "percentage"]),
      fee_amount: value.positive(),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("notify"),
      schedule_id: z.uuid(),
      notification_type: z.enum(["reminder", "overdue"]),
      channels: z
        .array(z.enum(["sms", "email"]))
        .min(1)
        .max(2),
    })
    .strict(),
]);
export const adminInstallmentEnvelope = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.uuid(),
    command: adminInstallmentCommand,
  })
  .strict();
