import { moneyNonNegative } from "@eventis/contracts";
import { z } from "zod";

const accountType = z.enum(["private", "public"]);
const interval = z.enum(["weekly", "monthly", "yearly"]);
const booleanQuery = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return value;
}, z.boolean().optional());

export const listInstallmentsDto = z.object({
  account_type: accountType.optional(),
  active: booleanQuery,
});

export const createInstallmentPlanDto = z
  .object({
    account_type: accountType,
    interval,
    duration_days: z.coerce.number().int().min(1).max(3660).optional(),
    price_minor: moneyNonNegative.refine(
      (value) => value > 0n,
      "price_minor must be greater than zero",
    ),
    is_active: z.boolean().optional().default(true),
  })
  .strict();

export const updateInstallmentPlanDto = z
  .object({
    interval: interval.optional(),
    duration_days: z.coerce.number().int().min(1).max(3660).optional(),
    price_minor: moneyNonNegative
      .refine((value) => value > 0n, "price_minor must be greater than zero")
      .optional(),
    is_active: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const setInstallmentActiveDto = z
  .object({
    is_active: z.boolean(),
  })
  .strict();

export type ListInstallmentsDto = z.infer<typeof listInstallmentsDto>;
export type CreateInstallmentPlanDto = z.infer<typeof createInstallmentPlanDto>;
export type UpdateInstallmentPlanDto = z.infer<typeof updateInstallmentPlanDto>;
export type SetInstallmentActiveDto = z.infer<typeof setInstallmentActiveDto>;
