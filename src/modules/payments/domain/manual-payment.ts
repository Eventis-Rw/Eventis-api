import type { PaymentMethod } from "./payment.js";

export type ManualPaymentPlatform = "FINDLOVE" | "ORGANISER";
/** A payment method's scope: one platform, or both at once. A submission's own platform is always exactly one — see ManualPaymentPlatform. */
export type ManualPaymentMethodPlatform = ManualPaymentPlatform | "BOTH";
export type ManualPaymentStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

/** Statuses a submission can still be approved or rejected from. */
export const OPEN_MANUAL_PAYMENT_STATUSES: readonly ManualPaymentStatus[] = [
  "PENDING",
  "UNDER_REVIEW",
];

export interface ManualPaymentMethod {
  readonly id: string;
  readonly provider: PaymentMethod;
  readonly platform: ManualPaymentMethodPlatform;
  readonly accountName: string | null;
  readonly phoneNumber: string;
  readonly instructions: string | null;
  readonly currency: string;
  readonly isActive: boolean;
  readonly displayOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ManualPaymentMethodSnapshot {
  readonly provider: PaymentMethod;
  readonly accountName: string | null;
  readonly phoneNumber: string;
}

export interface ManualPaymentPlanSnapshot {
  readonly name: string;
  readonly durationDays: number;
  readonly [key: string]: unknown;
}

export interface ManualPaymentSubmission {
  readonly id: string;
  readonly reference: string;
  readonly userId: string;
  readonly platform: ManualPaymentPlatform;
  readonly installmentPlanId: string | null;
  readonly organiserPlanId: string | null;
  readonly planSnapshot: ManualPaymentPlanSnapshot;
  readonly amountMinor: bigint;
  readonly currency: string;
  readonly paymentMethodId: string | null;
  readonly paymentMethodSnapshot: ManualPaymentMethodSnapshot;
  readonly receiptUploadId: string;
  readonly status: ManualPaymentStatus;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
  readonly rejectionReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ManualPaymentSubmissionWithUser extends ManualPaymentSubmission {
  readonly user: {
    readonly id: string;
    readonly email: string | null;
    readonly displayName: string | null;
  };
}
