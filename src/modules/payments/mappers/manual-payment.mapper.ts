import { toApiPaymentMethod } from "../domain/payment.js";
import type {
  ManualPaymentMethod,
  ManualPaymentMethodPlatform,
  ManualPaymentPlatform,
  ManualPaymentStatus,
  ManualPaymentSubmission,
  ManualPaymentSubmissionWithUser,
} from "../domain/manual-payment.js";

export type ApiManualPaymentStatus = "pending" | "under_review" | "approved" | "rejected";
export type ApiManualPaymentMethodPlatform = "findlove" | "organiser" | "both";

export function toApiPlatform(value: ManualPaymentPlatform): "findlove" | "organiser" {
  return value === "FINDLOVE" ? "findlove" : "organiser";
}

export function fromApiPlatform(value: "findlove" | "organiser"): ManualPaymentPlatform {
  return value === "findlove" ? "FINDLOVE" : "ORGANISER";
}

/** A payment method's platform can be "both"; a submission's own platform never is (use toApiPlatform/fromApiPlatform for that). */
export function toApiMethodPlatform(value: ManualPaymentMethodPlatform): ApiManualPaymentMethodPlatform {
  if (value === "BOTH") return "both";
  return toApiPlatform(value);
}

export function fromApiMethodPlatform(value: ApiManualPaymentMethodPlatform): ManualPaymentMethodPlatform {
  if (value === "both") return "BOTH";
  return fromApiPlatform(value);
}

export function fromApiStatus(value: ApiManualPaymentStatus): ManualPaymentStatus {
  return value.toUpperCase() as ManualPaymentStatus;
}

export interface ManualPaymentMethodResponse {
  id: string;
  provider: "mtn_momo" | "airtel_money";
  platform: ApiManualPaymentMethodPlatform;
  account_name: string | null;
  phone_number: string;
  instructions: string | null;
  currency: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export function toManualPaymentMethodResponse(
  row: ManualPaymentMethod,
): ManualPaymentMethodResponse {
  return {
    id: row.id,
    provider: toApiPaymentMethod(row.provider),
    platform: toApiMethodPlatform(row.platform),
    account_name: row.accountName,
    phone_number: row.phoneNumber,
    instructions: row.instructions,
    currency: row.currency,
    is_active: row.isActive,
    display_order: row.displayOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export interface ManualPaymentSubmissionResponse {
  id: string;
  reference: string;
  platform: "findlove" | "organiser";
  status: "pending" | "under_review" | "approved" | "rejected";
  plan: Record<string, unknown>;
  amount_minor: string;
  currency: string;
  payment_method: {
    provider: "mtn_momo" | "airtel_money";
    account_name: string | null;
    phone_number: string;
  };
  receipt_upload_id: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function toManualPaymentSubmissionResponse(
  row: ManualPaymentSubmission,
): ManualPaymentSubmissionResponse {
  return {
    id: row.id,
    reference: row.reference,
    platform: toApiPlatform(row.platform),
    status: row.status.toLowerCase() as ManualPaymentSubmissionResponse["status"],
    plan: row.planSnapshot,
    amount_minor: row.amountMinor.toString(),
    currency: row.currency,
    payment_method: {
      provider: toApiPaymentMethod(row.paymentMethodSnapshot.provider),
      account_name: row.paymentMethodSnapshot.accountName,
      phone_number: row.paymentMethodSnapshot.phoneNumber,
    },
    receipt_upload_id: row.receiptUploadId,
    reviewed_at: row.reviewedAt?.toISOString() ?? null,
    rejection_reason: row.rejectionReason,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

export interface ManualPaymentAdminResponse extends ManualPaymentSubmissionResponse {
  user: { id: string; email: string | null; display_name: string | null };
}

export function toManualPaymentAdminResponse(
  row: ManualPaymentSubmissionWithUser,
): ManualPaymentAdminResponse {
  return {
    ...toManualPaymentSubmissionResponse(row),
    user: {
      id: row.user.id,
      email: row.user.email,
      display_name: row.user.displayName,
    },
  };
}
