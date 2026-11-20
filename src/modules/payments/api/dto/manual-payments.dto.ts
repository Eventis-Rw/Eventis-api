import { z } from "zod";

const platform = z.enum(["findlove", "organiser"]);
/** A payment method's scope can be "both"; a submission's own platform (above) never is. */
const methodPlatform = z.enum(["findlove", "organiser", "both"]);
const paymentMethod = z.enum(["mtn_momo", "airtel_money"]);
const status = z.enum(["pending", "under_review", "approved", "rejected"]);
const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const listManualPaymentMethodsDto = z.object({
  platform: platform.optional(),
});
export type ListManualPaymentMethodsDto = z.infer<typeof listManualPaymentMethodsDto>;

export const createManualPaymentMethodDto = z
  .object({
    provider: paymentMethod,
    platform: methodPlatform,
    account_name: z.string().trim().min(1).max(120).nullable().optional(),
    phone_number: z.string().trim().min(5).max(30),
    instructions: z.string().trim().max(1000).nullable().optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .default("RWF"),
    is_active: z.boolean().optional().default(true),
    display_order: z.coerce.number().int().min(0).max(1000).optional().default(0),
  })
  .strict();
export type CreateManualPaymentMethodDto = z.infer<typeof createManualPaymentMethodDto>;

export const updateManualPaymentMethodDto = z
  .object({
    provider: paymentMethod.optional(),
    platform: methodPlatform.optional(),
    account_name: z.string().trim().min(1).max(120).nullable().optional(),
    phone_number: z.string().trim().min(5).max(30).optional(),
    instructions: z.string().trim().max(1000).nullable().optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    is_active: z.boolean().optional(),
    display_order: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });
export type UpdateManualPaymentMethodDto = z.infer<typeof updateManualPaymentMethodDto>;

export const setManualPaymentMethodActiveDto = z.object({ is_active: z.boolean() }).strict();
export type SetManualPaymentMethodActiveDto = z.infer<typeof setManualPaymentMethodActiveDto>;

export const submitManualPaymentDto = z
  .object({
    platform,
    installment_plan_id: z.uuid().optional(),
    organiser_plan_id: z.uuid().optional(),
    payment_method_id: z.uuid(),
    receipt_upload_id: z.uuid(),
  })
  .strict()
  .refine(
    (value) =>
      value.platform === "findlove"
        ? Boolean(value.installment_plan_id) && !value.organiser_plan_id
        : Boolean(value.organiser_plan_id) && !value.installment_plan_id,
    {
      message:
        "installment_plan_id is required for findlove and organiser_plan_id for organiser (never both)",
    },
  );
export type SubmitManualPaymentDto = z.infer<typeof submitManualPaymentDto>;

export const listMyManualPaymentsDto = pageSchema.extend({
  platform: platform.optional(),
  status: status.optional(),
});
export type ListMyManualPaymentsDto = z.infer<typeof listMyManualPaymentsDto>;

export const listManualPaymentsAdminDto = pageSchema.extend({
  platform: platform.optional(),
  status: status.optional(),
  payment_method_id: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  q: z.string().trim().min(1).max(200).optional(),
});
export type ListManualPaymentsAdminDto = z.infer<typeof listManualPaymentsAdminDto>;

export const rejectManualPaymentDto = z
  .object({
    rejection_reason: z.string().trim().min(3).max(1000),
  })
  .strict();
export type RejectManualPaymentDto = z.infer<typeof rejectManualPaymentDto>;

export const idParamDto = z.object({ id: z.uuid() });
