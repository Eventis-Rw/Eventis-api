import { z } from "zod";
const reason = z.string().trim().min(5).max(500);
const tierPermissions = z
  .object({ public: z.boolean(), private: z.boolean() })
  .strict();
export const permissionsSchema = z
  .object({ public: tierPermissions, private: tierPermissions })
  .strict();
export const adminMembershipCommand = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("plan"),
      id: z.string().min(1).max(100),
      price: z.number().int().positive().max(1e9),
      active: z.boolean(),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("rules"),
      permissions: permissionsSchema,
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("member"),
      id: z.uuid(),
      action: z.enum([
        "grant",
        "extend",
        "revoke",
        "suspend",
        "restore",
        "ban",
      ]),
      planId: z.string().max(100).optional(),
      days: z.number().optional(),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("checkout"),
      id: z.uuid(),
      planId: z.string().max(100),
      method: z.enum(["MTN MoMo", "Airtel Money"]),
      outcome: z.enum(["success", "pending", "failed"]),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("settle"),
      id: z.uuid(),
      outcome: z.enum(["success", "failed"]),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("verify"),
      id: z.uuid(),
      decision: z.enum([
        "pending",
        "verified",
        "rejected",
        "resubmission_required",
      ]),
      reason,
    })
    .strict(),
  z
    .object({
      type: z.literal("report"),
      id: z.uuid(),
      decision: z.enum(["dismiss", "resolve", "suspend", "ban"]),
      reason,
    })
    .strict(),
]);
export const adminMembershipEnvelope = z
  .object({
    revision: z.number().int().nonnegative(),
    requestId: z.uuid(),
    command: adminMembershipCommand,
  })
  .strict();
