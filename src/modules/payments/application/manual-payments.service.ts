import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { EmailService } from "../../../infrastructure/email/email.service.js";
import { OrganisationsService } from "../../organisations/index.js";
import {
  type ManualPaymentPlanSnapshot,
  type ManualPaymentPlatform,
  type ManualPaymentStatus,
  type ManualPaymentSubmission,
} from "../domain/manual-payment.js";
import { ManualPaymentRepository } from "../infrastructure/manual-payment.repository.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";
import { OrganiserApplicationsService } from "./organiser-applications.service.js";

/**
 * For email copy. Despite the field's name, priceMinor on an InstallmentPlan
 * or OrganiserPlan is the whole RWF amount (e.g. 499 means RWF 499), not
 * cents — same convention as admin-membership.ts's own `money()` helper.
 * No float math on money either way.
 */
function money(amountMinor: bigint, currency: string): string {
  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;
  return `${negative ? "-" : ""}${currency} ${abs.toLocaleString("en-US")}`;
}

@Injectable()
export class ManualPaymentsService {
  constructor(
    private readonly repo: ManualPaymentRepository,
    private readonly payments: PaymentRepository,
    private readonly organisations: OrganisationsService,
    private readonly emails: EmailService,
    private readonly clock: Clock,
    private readonly applications: OrganiserApplicationsService,
  ) {}

  // ---- User: submit & track ------------------------------------------------

  async submit(
    userId: string,
    input: {
      platform: ManualPaymentPlatform;
      installmentPlanId?: string | undefined;
      organiserPlanId?: string | undefined;
      paymentMethodId: string;
      receiptUploadId: string;
    },
  ): Promise<ManualPaymentSubmission> {
    const open = await this.repo.findOpenSubmissionForUser(
      userId,
      input.platform,
    );
    if (open) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `You already have a payment (${open.reference}) awaiting review. Wait for it to be reviewed before submitting another.`,
      );
    }

    const receipt = await this.repo.findReceiptUpload(
      input.receiptUploadId,
      userId,
    );
    if (!receipt || receipt.purpose !== "PAYMENT_RECEIPT") {
      throw AppError.validation({
        receiptUploadId: ["Upload your payment screenshot first."],
      });
    }

    const method = await this.repo.findMethodById(input.paymentMethodId);
    if (
      !method ||
      !method.isActive ||
      (method.platform !== input.platform && method.platform !== "BOTH")
    ) {
      throw AppError.validation({
        paymentMethodId: ["That payment method is no longer available."],
      });
    }

    // The amount, currency and plan terms are always read from the plan row
    // itself here, never trusted from the request body.
    let planSnapshot: ManualPaymentPlanSnapshot;
    let amountMinor: bigint;
    let currency: string;
    let installmentPlanId: string | null = null;
    let organiserPlanId: string | null = null;

    if (input.platform === "FINDLOVE") {
      if (!input.installmentPlanId) {
        throw AppError.validation({
          installmentPlanId: ["Choose a membership plan."],
        });
      }
      const plan = await this.payments.findInstallmentPlanById(
        input.installmentPlanId,
      );
      if (!plan || !plan.isActive) {
        throw AppError.validation({
          installmentPlanId: ["That plan is no longer available."],
        });
      }
      installmentPlanId = plan.id;
      amountMinor = plan.priceMinor;
      currency = plan.currency;
      planSnapshot = {
        name: `FindLove ${plan.accountType.toLowerCase()} (${plan.interval.toLowerCase()})`,
        durationDays: plan.durationDays,
        accountType: plan.accountType,
        interval: plan.interval,
      };
    } else {
      if (!input.organiserPlanId) {
        throw AppError.validation({
          organiserPlanId: ["Choose an organiser plan."],
        });
      }
      const plan = await this.organisations.getActivePlan(
        input.organiserPlanId,
      );
      organiserPlanId = plan.id;
      amountMinor = plan.priceMinor;
      currency = plan.currency;
      planSnapshot = {
        name: plan.name,
        durationDays: plan.durationDays,
        interval: plan.interval,
        postQuota: plan.postQuota,
      };
    }

    const reference = await this.repo.nextManualPaymentReference();
    const submission = await this.repo.createSubmission({
      reference,
      userId,
      platform: input.platform,
      installmentPlanId,
      organiserPlanId,
      planSnapshot,
      amountMinor,
      currency,
      paymentMethodId: method.id,
      paymentMethodSnapshot: {
        provider: method.provider,
        accountName: method.accountName,
        phoneNumber: method.phoneNumber,
      },
      receiptUploadId: input.receiptUploadId,
    });

    const user = await this.repo.findUserContact(userId);
    if (user?.email) {
      void this.emails.sendBestEffort({
        to: user.email,
        subject: `We received your payment (${submission.reference})`,
        html: `<p>Hi${user.displayName ? ` ${user.displayName}` : ""},</p>
<p>We received your payment submission for <strong>${planSnapshot.name}</strong> (${money(amountMinor, currency)}) and it's now waiting for review.</p>
<p>Reference: <strong>${submission.reference}</strong></p>
<p>We'll email you as soon as it's approved or if we need anything else from you.</p>`,
      });
    }

    return submission;
  }

  async listMine(
    userId: string,
    filter: {
      platform?: ManualPaymentPlatform | undefined;
      status?: ManualPaymentStatus | undefined;
      page: number;
      limit: number;
    },
  ) {
    return this.repo.listForUser(userId, filter);
  }

  async getMine(userId: string, id: string): Promise<ManualPaymentSubmission> {
    const row = await this.repo.findSubmissionById(id);
    if (!row || row.userId !== userId) throw AppError.notFound("That payment");
    return row;
  }

  // ---- Admin: review --------------------------------------------------------

  async listForAdmin(filter: {
    platform?: ManualPaymentPlatform | undefined;
    status?: ManualPaymentStatus | undefined;
    paymentMethodId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    q?: string | undefined;
    page: number;
    limit: number;
  }) {
    return this.repo.listForAdmin(filter);
  }

  async getForAdmin(id: string) {
    const row = await this.repo.findSubmissionById(id);
    if (!row) throw AppError.notFound("That payment");
    return row;
  }

  async markUnderReview(id: string) {
    const row = await this.repo.markUnderReview(id);
    if (!row) throw AppError.notFound("That payment");
    return row;
  }

  async approve(
    adminUserId: string,
    id: string,
    verifiedTransactionId?: string,
  ): Promise<ManualPaymentSubmission> {
    const now = this.clock.now();
    const { submission, resolved, changed } = await this.repo.transaction(
      async (tx) => {
        const submission = await this.repo.findSubmissionById(id, tx);
        if (!submission) throw AppError.notFound("That payment");
        const resolved = await this.repo.resolve(
          {
            id,
            status: "APPROVED",
            reviewerId: adminUserId,
            rejectionReason: null,
            now,
          },
          tx,
        );
        if (!resolved)
          return { submission, resolved: submission, changed: false };
        if (submission.platform === "FINDLOVE") {
          if (!submission.installmentPlanId)
            throw AppError.validation({
              installmentPlanId: ["That membership plan is unavailable."],
            });
          const plan = await this.payments.findInstallmentPlanById(
            submission.installmentPlanId,
            tx,
          );
          if (!plan)
            throw AppError.validation({
              installmentPlanId: ["That membership plan is unavailable."],
            });
          await this.payments.activateFindLoveFromManualPayment(
            {
              userId: submission.userId,
              plan: {
                ...plan,
                priceMinor: submission.amountMinor,
                durationDays: submission.planSnapshot.durationDays,
              },
              now,
            },
            tx,
          );
        } else {
          if (typeof verifiedTransactionId !== "string" || !/^[A-Za-z0-9-]{4,160}$/.test(verifiedTransactionId.trim())) {
            throw AppError.validation({ verified_transaction_id: ["Enter the provider transaction ID you verified."] });
          }
          const transactionId = verifiedTransactionId.trim().toUpperCase();
          const duplicate = await tx.manualPaymentSubmission.findFirst({
            where: { verifiedProvider: submission.paymentMethodSnapshot.provider, verifiedTransactionId: transactionId },
          });
          if (duplicate) throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "This provider transaction has already been used.");
          await tx.manualPaymentSubmission.update({
            where: { id: submission.id },
            data: { verifiedProvider: submission.paymentMethodSnapshot.provider, verifiedTransactionId: transactionId },
          });
          if (!submission.organiserPlanId)
            throw AppError.validation({
              organiserPlanId: ["That organiser plan is unavailable."],
            });
          const user = await tx.user.findUniqueOrThrow({ where: { id: submission.userId }, select: { accountType: true } });
          if (user.accountType !== "POSTER") {
            await this.applications.paymentVerified(submission.id, submission.userId, tx);
          } else await this.organisations.activateFromManualPayment(
            submission.userId,
            submission.organiserPlanId,
            now,
            tx,
            {
              durationDays: submission.planSnapshot.durationDays,
              priceMinor: submission.amountMinor,
              postQuota:
                typeof submission.planSnapshot.postQuota === "number"
                  ? submission.planSnapshot.postQuota
                  : null,
            },
          );
        }
        return { submission, resolved, changed: true };
      },
    ).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        if (Array.isArray(target) && target.includes("verified_provider") && target.includes("verified_transaction_id")) {
          throw AppError.conflict(ERROR_CODES.VALIDATION_FAILED, "This provider transaction has already been used.");
        }
      }
      throw error;
    });
    if (!changed) return resolved;

    if (submission.user.email) {
      void this.emails.sendBestEffort({
        to: submission.user.email,
        subject: `Your payment was approved (${resolved.reference})`,
        html: `<p>Hi${submission.user.displayName ? ` ${submission.user.displayName}` : ""},</p>
<p>Your payment for <strong>${resolved.planSnapshot.name}</strong> has been verified.${submission.platform === "ORGANISER" ? " New organiser applications now await a separate review." : " Your plan is now active."}</p>
<p>Reference: <strong>${resolved.reference}</strong><br/>
Amount: ${money(resolved.amountMinor, resolved.currency)}<br/>
Verified: ${now.toISOString()}</p>`,
      });
    }

    return resolved;
  }

  async reject(
    adminUserId: string,
    id: string,
    rejectionReason: string,
  ): Promise<ManualPaymentSubmission> {
    const submission = await this.repo.findSubmissionById(id);
    if (!submission) throw AppError.notFound("That payment");

    const now = this.clock.now();
    const resolved = await this.repo.transaction(async (tx) => {
      const result = await this.repo.resolve({
      id,
      status: "REJECTED",
      reviewerId: adminUserId,
      rejectionReason,
      now,
      }, tx);
      if (result && submission.platform === "ORGANISER") {
        await tx.organiserApplication.updateMany({
          where: { manualPaymentId: id, status: "PENDING_PAYMENT" },
          data: { manualPaymentId: null },
        });
      }
      return result;
    });
    if (!resolved) return submission;

    if (submission.user.email) {
      void this.emails.sendBestEffort({
        to: submission.user.email,
        subject: `Your payment could not be verified (${resolved.reference})`,
        html: `<p>Hi${submission.user.displayName ? ` ${submission.user.displayName}` : ""},</p>
<p>We couldn't verify your payment for <strong>${resolved.planSnapshot.name}</strong>.</p>
<p>Reference: <strong>${resolved.reference}</strong><br/>
Reason: ${rejectionReason}</p>
<p>You can submit a new payment at any time from the app.</p>`,
      });
    }

    return resolved;
  }
}
