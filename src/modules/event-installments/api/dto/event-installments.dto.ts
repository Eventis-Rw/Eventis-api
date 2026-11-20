import { moneyWire } from "@eventis/contracts";
import { z } from "zod";

const frequency = z.enum(["weekly", "monthly", "yearly"]);
const initialPaymentType = z.enum(["fixed", "percent"]);
const lateFeeType = z.enum(["fixed", "percent"]);
const agreementStatus = z.enum([
  "draft",
  "active",
  "completed",
  "overdue",
  "cancelled",
  "suspended",
]);
const paymentMethod = z.enum(["mtn_momo", "airtel_money"]);

const dateSchema = z.preprocess((val) => {
  if (typeof val === "string" || val instanceof Date) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return val;
}, z.date({ message: "must be a valid date" }));

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};


export const createPlanDto = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable().default(null),
    frequency,
    interval_count: z.coerce.number().int().min(1).max(52),
    installment_count: z.coerce.number().int().min(1).max(120),
    initial_payment_type: initialPaymentType,
    initial_payment_value: moneyWire,
    interest_rate_bps: z.coerce.number().int().min(0).max(10000),
    late_fee_type: lateFeeType,
    late_fee_value: moneyWire,
    grace_period_days: z.coerce.number().int().min(0).max(90),
    allow_partial_payment: z.boolean().default(false),
    allow_early_payment: z.boolean().default(true),
    currency: z.literal("RWF"),
    is_active: z.boolean().default(true),
  })
  .strict();

export const updatePlanDto = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    frequency: frequency.optional(),
    interval_count: z.coerce.number().int().min(1).max(52).optional(),
    installment_count: z.coerce.number().int().min(1).max(120).optional(),
    initial_payment_type: initialPaymentType.optional(),
    initial_payment_value: moneyWire.optional(),
    interest_rate_bps: z.coerce.number().int().min(0).max(10000).optional(),
    late_fee_type: lateFeeType.optional(),
    late_fee_value: moneyWire.optional(),
    grace_period_days: z.coerce.number().int().min(0).max(90).optional(),
    allow_partial_payment: z.boolean().optional(),
    allow_early_payment: z.boolean().optional(),
    is_active: z.boolean().optional(),
  })
  .strict();

export const setPlanStatusDto = z
  .object({
    is_active: z.boolean(),
  })
  .strict();

export const listPlansDto = z.object({
  is_active: z.enum(["true", "false"]).optional(),
});


export const previewDto = z
  .object({
    plan_id: z.uuid(),
    total_amount_minor: moneyWire,
    currency: z.literal("RWF"),
    start_date: dateSchema,
  })
  .strict();


export const assignPlanDto = z
  .object({
    customer_id: z.uuid(),
    event_id: z.uuid(),
    plan_id: z.uuid(),
    total_amount_minor: moneyWire,
    start_date: dateSchema,
    status: z.enum(["draft", "active"]).default("active"),
  })
  .strict();

export const createCustomAgreementDto = z
  .object({
    customer_id: z.uuid(),
    event_id: z.uuid(),
    total_amount_minor: moneyWire,
    initial_payment_minor: moneyWire,
    interest_rate_bps: z.coerce.number().int().min(0).max(10000),
    frequency,
    interval_count: z.coerce.number().int().min(1).max(52),
    installment_count: z.coerce.number().int().min(1).max(120),
    start_date: dateSchema,
    grace_period_days: z.coerce.number().int().min(0).max(90),
    late_fee_type: lateFeeType,
    late_fee_value: moneyWire,
    allow_partial_payment: z.boolean().default(false),
    allow_early_payment: z.boolean().default(true),
    status: z.enum(["draft", "active"]).default("active"),
  })
  .strict();

export const reviseAgreementDto = z
  .object({
    frequency,
    interval_count: z.coerce.number().int().min(1).max(52),
    installment_count: z.coerce.number().int().min(1).max(120),
    start_date: dateSchema,
    allow_partial_payment: z.boolean(),
    allow_early_payment: z.boolean(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const transitionAgreementDto = z
  .object({
    status: agreementStatus,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const listAgreementsDto = z.object({
  ...pagination,
  customer_id: z.uuid().optional(),
  event_id: z.uuid().optional(),
  status: z.enum(agreementStatus.options).optional(),
  created_from: dateSchema.optional(),
  created_to: dateSchema.optional(),
});

export const listSchedulesDto = z.object({
  ...pagination,
  status: z
    .enum(["pending", "partially_paid", "paid", "overdue", "waived", "cancelled"])
    .optional(),
});


export const initiatePaymentDto = z
  .object({
    amount_minor: moneyWire,
    payment_method: paymentMethod,
    phone_number: z.string().trim().min(9).max(20),
  })
  .strict();

export const recordManualPaymentDto = z
  .object({
    agreement_id: z.uuid(),
    schedule_id: z.uuid(),
    amount_minor: moneyWire,
    transaction_reference: z.string().trim().min(3).max(160),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const listPaymentsDto = z.object({
  ...pagination,
  customer_id: z.uuid().optional(),
  agreement_id: z.uuid().optional(),
  event_id: z.uuid().optional(),
  status: z
    .enum(["pending", "succeeded", "failed", "cancelled", "refunded", "partially_refunded"])
    .optional(),
});


export const requestRefundDto = z
  .object({
    installment_payment_id: z.uuid(),
    amount_minor: moneyWire,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const completeRefundDto = z
  .object({
    provider_refund_reference: z.string().trim().min(3).max(160),
  })
  .strict();

export const rejectRefundDto = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const listRefundsDto = z.object({
  ...pagination,
  status: z.enum(["requested", "completed", "rejected"]).optional(),
});


export const applyLateFeeDto = z
  .object({
    schedule_id: z.uuid(),
    amount_minor: moneyWire,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const waiveLateFeeDto = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const listLateFeesDto = z.object({
  ...pagination,
  agreement_id: z.uuid().optional(),
  schedule_id: z.uuid().optional(),
});


export const adjustDueDateDto = z
  .object({
    due_date: dateSchema,
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

export const waiveScheduleDto = z
  .object({
    reason: z.string().trim().min(3).max(500),
  })
  .strict();


export const overdueSweepDto = z
  .object({
    apply_late_fees: z.boolean().default(true),
  })
  .strict();

export const dueRemindersDto = z
  .object({
    from: dateSchema,
    to: dateSchema,
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();


export const listNotificationsDto = z.object({
  ...pagination,
  customer_id: z.uuid().optional(),
  agreement_id: z.uuid().optional(),
  status: z.enum(["pending", "sent", "failed"]).optional(),
});


export const reportSummaryDto = z.object({
  created_from: dateSchema.optional(),
  created_to: dateSchema.optional(),
});

export const recentPaymentsDto = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customer_id: z.uuid().optional(),
  event_id: z.uuid().optional(),
});

export const upcomingSchedulesDto = z.object({
  from: dateSchema,
  to: dateSchema,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  customer_id: z.uuid().optional(),
});

export const listAuditLogsDto = z.object({
  ...pagination,
  entity_id: z.string().trim().min(1).optional(),
  entity_type: z.string().trim().min(1).optional(),
  actor_id: z.uuid().optional(),
});


export const listMyAgreementsDto = z.object({
  event_id: z.uuid().optional(),
});

export const listMyPaymentsDto = z.object({
  agreement_id: z.uuid().optional(),
});

export const listMyNotificationsDto = z.object({
  agreement_id: z.uuid().optional(),
});

export type CreatePlanDto = z.infer<typeof createPlanDto>;
export type UpdatePlanDto = z.infer<typeof updatePlanDto>;
export type SetPlanStatusDto = z.infer<typeof setPlanStatusDto>;
export type ListPlansDto = z.infer<typeof listPlansDto>;
export type PreviewDto = z.infer<typeof previewDto>;
export type AssignPlanDto = z.infer<typeof assignPlanDto>;
export type CreateCustomAgreementDto = z.infer<typeof createCustomAgreementDto>;
export type ReviseAgreementDto = z.infer<typeof reviseAgreementDto>;
export type TransitionAgreementDto = z.infer<typeof transitionAgreementDto>;
export type ListAgreementsDto = z.infer<typeof listAgreementsDto>;
export type ListSchedulesDto = z.infer<typeof listSchedulesDto>;
export type InitiatePaymentDto = z.infer<typeof initiatePaymentDto>;
export type RecordManualPaymentDto = z.infer<typeof recordManualPaymentDto>;
export type ListPaymentsDto = z.infer<typeof listPaymentsDto>;
export type RequestRefundDto = z.infer<typeof requestRefundDto>;
export type CompleteRefundDto = z.infer<typeof completeRefundDto>;
export type RejectRefundDto = z.infer<typeof rejectRefundDto>;
export type ListRefundsDto = z.infer<typeof listRefundsDto>;
export type ApplyLateFeeDto = z.infer<typeof applyLateFeeDto>;
export type WaiveLateFeeDto = z.infer<typeof waiveLateFeeDto>;
export type ListLateFeesDto = z.infer<typeof listLateFeesDto>;
export type AdjustDueDateDto = z.infer<typeof adjustDueDateDto>;
export type WaiveScheduleDto = z.infer<typeof waiveScheduleDto>;
export type OverdueSweepDto = z.infer<typeof overdueSweepDto>;
export type DueRemindersDto = z.infer<typeof dueRemindersDto>;
export type ListNotificationsDto = z.infer<typeof listNotificationsDto>;
export type ReportSummaryDto = z.infer<typeof reportSummaryDto>;
export type RecentPaymentsDto = z.infer<typeof recentPaymentsDto>;
export type UpcomingSchedulesDto = z.infer<typeof upcomingSchedulesDto>;
export type ListAuditLogsDto = z.infer<typeof listAuditLogsDto>;
export type ListMyAgreementsDto = z.infer<typeof listMyAgreementsDto>;
export type ListMyPaymentsDto = z.infer<typeof listMyPaymentsDto>;
export type ListMyNotificationsDto = z.infer<typeof listMyNotificationsDto>;
