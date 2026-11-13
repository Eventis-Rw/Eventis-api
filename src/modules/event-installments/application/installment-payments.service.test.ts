import { describe, expect, it, mock } from "bun:test";

import { FixedClock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import type {
  PaymentCollectionsService,
  PaymentIntentWithPlan,
} from "../../payments/index.js";
import type { EventInstallmentAgreement } from "../domain/installment-agreement.js";
import type { EventInstallmentSchedule } from "../domain/installment-agreement.js";
import type { EventInstallmentPayment } from "../domain/installment-payment.js";
import type { EventInstallmentRepository } from "../infrastructure/installment.repository.js";
import { InstallmentPaymentsService } from "./installment-payments.service.js";

const NOW = new Date("2026-02-01T00:00:00.000Z");

function agreement(
  overrides: Partial<EventInstallmentAgreement> = {},
): EventInstallmentAgreement {
  return {
    id: "agr-1",
    customerId: "cust-1",
    eventId: "evt-1",
    planId: "plan-1",
    totalAmountMinor: 100_000n,
    initialPaymentMinor: 0n,
    interestAmountMinor: 0n,
    totalPayableMinor: 100_000n,
    amountPaidMinor: 0n,
    refundedAmountMinor: 0n,
    lateFeesTotalMinor: 0n,
    outstandingBalanceMinor: 100_000n,
    currency: "RWF",
    frequency: "MONTHLY",
    intervalCount: 1,
    installmentCount: 2,
    gracePeriodDays: 0,
    lateFeeType: "FIXED",
    lateFeeValue: 0n,
    allowPartialPayment: true,
    allowEarlyPayment: true,
    startDate: NOW,
    status: "ACTIVE",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function schedule(
  overrides: Partial<EventInstallmentSchedule> = {},
): EventInstallmentSchedule {
  return {
    id: "sch-1",
    agreementId: "agr-1",
    installmentNumber: 1,
    isInitialPayment: false,
    dueDate: NOW,
    principalAmountMinor: 50_000n,
    interestAmountMinor: 0n,
    lateFeeAmountMinor: 0n,
    amountDueMinor: 50_000n,
    amountPaidMinor: 0n,
    refundedAmountMinor: 0n,
    outstandingAmountMinor: 50_000n,
    status: "PENDING",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function payment(
  overrides: Partial<EventInstallmentPayment> = {},
): EventInstallmentPayment {
  return {
    id: "pay-1",
    agreementId: "agr-1",
    scheduleId: "sch-1",
    customerId: "cust-1",
    paymentIntentId: "intent-1",
    source: "PROVIDER",
    amountMinor: 50_000n,
    refundedAmountMinor: 0n,
    currency: "RWF",
    paymentMethod: "MTN_MOMO",
    transactionReference: null,
    status: "PENDING",
    paidAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function intent(
  overrides: Partial<PaymentIntentWithPlan> = {},
): PaymentIntentWithPlan {
  return {
    id: "intent-1",
    userId: "cust-1",
    purpose: "EVENT_INSTALLMENT",
    referenceId: "pay-1",
    plan: null,
    amountMinor: 50_000n,
    currency: "RWF",
    status: "AWAITING_USER",
    providerTransactionId: null,
    paidAt: null,
    ...overrides,
  } as PaymentIntentWithPlan;
}

function harness(options: {
  agreement?: EventInstallmentAgreement;
  schedule?: EventInstallmentSchedule;
  siblings?: EventInstallmentSchedule[];
  pending?: EventInstallmentPayment | null;
  created?: EventInstallmentPayment;
  foundById?: EventInstallmentPayment | null;
} = {}) {
  const agreementRow = options.agreement ?? agreement();
  const scheduleRow = options.schedule ?? schedule();
  const repo = {
    findScheduleWithAgreement: mock(async () => ({
      agreement: agreementRow,
      schedule: scheduleRow,
    })),
    findSchedulesForAgreement: mock(
      async () => options.siblings ?? [scheduleRow],
    ),
    findPendingInstallmentPayment: mock(async () => options.pending ?? null),
    createInstallmentPayment: mock(
      async () => options.created ?? payment(),
    ),
    linkPaymentIntent: mock(async () => undefined),
    findInstallmentPaymentById: mock(
      async () => options.foundById ?? (options.created ?? payment()),
    ),
    applyConfirmedCollection: mock(async () => ({
      applied: true,
      payment: payment({ status: "SUCCEEDED" }),
    })),
    setInstallmentPaymentStatus: mock(async () => undefined),
    findInstallmentPaymentByIntent: mock(async () => null),
    createAuditLog: mock(async () => undefined),
    findAgreementById: mock(async () => agreementRow),
    findEventById: mock(async () => null),
    listInstallmentPayments: mock(async () => ({ items: [], total: 0 })),
  } as unknown as EventInstallmentRepository;
  const collections = {
    initiate: mock(async () => ({ payment: intent() })),
    checkStatus: mock(async () => intent()),
  } as unknown as PaymentCollectionsService;
  const service = new InstallmentPaymentsService(
    repo,
    collections,
    new FixedClock(NOW),
  );
  return { service, repo, collections, agreementRow, scheduleRow };
}

const baseInput = {
  userId: "cust-1",
  agreementId: "agr-1",
  scheduleId: "sch-1",
  amountMinor: 50_000n,
  paymentMethod: "MTN_MOMO" as const,
  phoneNumber: "250788000000",
};

async function expectStatus(
  promise: Promise<unknown>,
  status: number,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(status);
    return;
  }
  throw new Error(`expected AppError with status ${status}`);
}

describe("InstallmentPaymentsService.initiate", () => {
  it("rejects another customer's agreement", async () => {
    const { service } = harness();
    await expectStatus(
      service.initiate({ ...baseInput, userId: "intruder" }, undefined),
      403,
    );
  });

  it("rejects a non-active agreement", async () => {
    const { service } = harness({ agreement: agreement({ status: "OVERDUE" }) });
    await expectStatus(service.initiate(baseInput, undefined), 409);
  });

  it("rejects a paid schedule", async () => {
    const { service } = harness({ schedule: schedule({ status: "PAID" }) });
    await expectStatus(service.initiate(baseInput, undefined), 409);
  });

  it("rejects a non-positive amount", async () => {
    const { service } = harness();
    await expectStatus(
      service.initiate({ ...baseInput, amountMinor: 0n }, undefined),
      422,
    );
  });

  it("rejects an amount above the outstanding", async () => {
    const { service } = harness();
    await expectStatus(
      service.initiate({ ...baseInput, amountMinor: 50_001n }, undefined),
      422,
    );
  });

  it("rejects a partial payment when the agreement forbids it", async () => {
    const { service } = harness({
      agreement: agreement({ allowPartialPayment: false }),
    });
    await expectStatus(
      service.initiate({ ...baseInput, amountMinor: 10_000n }, undefined),
      422,
    );
  });

  it("rejects an early payment when the agreement forbids it", async () => {
    const first = schedule({ id: "sch-1", installmentNumber: 1 });
    const second = schedule({
      id: "sch-2",
      installmentNumber: 2,
      amountDueMinor: 50_000n,
    });
    const { service } = harness({
      schedule: second,
      siblings: [first, second],
      agreement: agreement({ allowEarlyPayment: false }),
    });
    await expectStatus(
      service.initiate(
        { ...baseInput, scheduleId: "sch-2" },
        undefined,
      ),
      422,
    );
  });

  it("creates the payment, initiates the collection, and links the intent", async () => {
    const created = payment();
    const { service, repo, collections } = harness({ created });

    const result = await service.initiate(baseInput, "idem-1");

    expect(repo.createInstallmentPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        agreementId: "agr-1",
        scheduleId: "sch-1",
        source: "PROVIDER",
        amountMinor: 50_000n,
      }),
    );
    expect(collections.initiate).toHaveBeenCalledWith(
      expect.objectContaining({
        purpose: "EVENT_INSTALLMENT",
        referenceId: "pay-1",
        amountMinor: 50_000n,
      }),
      "idem-1",
    );
    expect(repo.linkPaymentIntent).toHaveBeenCalledWith("pay-1", "intent-1");
    expect(result.paymentIntent?.id).toBe("intent-1");
  });

  it("credits immediately when initiation reports a synchronous success", async () => {
    const { service, repo, collections } = harness();
    collections.initiate = mock(async () => ({
      payment: intent({ status: "SUCCEEDED", providerTransactionId: "tx-1" }),
    })) as unknown as PaymentCollectionsService["initiate"];

    const result = await service.initiate(baseInput, undefined);

    expect(repo.applyConfirmedCollection).toHaveBeenCalledWith(
      expect.objectContaining({ installmentPaymentId: "pay-1" }),
    );
    expect(result.message).toBe("Payment completed.");
  });

  it("reuses an in-flight collection for the same schedule and method", async () => {
    const pending = payment();
    const { service, repo, collections } = harness({ pending });

    const result = await service.initiate(baseInput, undefined);

    expect(repo.createInstallmentPayment).not.toHaveBeenCalled();
    expect(collections.checkStatus).toHaveBeenCalledWith(
      "cust-1",
      "intent-1",
    );
    expect(result.message).toContain("already in progress");
  });
});

describe("InstallmentPaymentsService.handlePaymentSucceeded", () => {
  it("applies the collection once through compare-and-swap", async () => {
    const { service, repo } = harness();
    await service.handlePaymentSucceeded({
      paymentIntentId: "intent-1",
      referenceId: "pay-1",
      providerTransactionId: "tx-1",
      paidAt: NOW,
      now: NOW,
    });
    expect(repo.applyConfirmedCollection).toHaveBeenCalledTimes(1);
    expect(repo.applyConfirmedCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        installmentPaymentId: "pay-1",
        transactionReference: "tx-1",
      }),
    );
  });

  it("falls back to the intent lookup when referenceId is missing", async () => {
    const { service, repo } = harness();
    repo.findInstallmentPaymentByIntent = mock(async () => payment());

    await service.handlePaymentSucceeded({
      paymentIntentId: "intent-1",
      referenceId: null,
      providerTransactionId: null,
      paidAt: null,
      now: NOW,
    });

    expect(repo.applyConfirmedCollection).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no installment payment can be resolved", async () => {
    const { service, repo } = harness();
    await service.handlePaymentSucceeded({
      paymentIntentId: "intent-x",
      referenceId: null,
      providerTransactionId: null,
      paidAt: null,
      now: NOW,
    });
    expect(repo.applyConfirmedCollection).not.toHaveBeenCalled();
  });

  it("is safe to call twice (already-applied result is ignored)", async () => {
    const { service, repo } = harness();
    repo.applyConfirmedCollection = mock(async () => ({
      applied: false,
      payment: payment({ status: "SUCCEEDED" }),
    }));

    await service.handlePaymentSucceeded({
      paymentIntentId: "intent-1",
      referenceId: "pay-1",
      providerTransactionId: "tx-1",
      paidAt: NOW,
      now: NOW,
    });
    await service.handlePaymentSucceeded({
      paymentIntentId: "intent-1",
      referenceId: "pay-1",
      providerTransactionId: "tx-1",
      paidAt: NOW,
      now: NOW,
    });

    expect(repo.applyConfirmedCollection).toHaveBeenCalledTimes(2);
    expect(repo.createAuditLog).not.toHaveBeenCalled();
  });
});

describe("InstallmentPaymentsService.checkStatus", () => {
  it("mirrors a failed intent without moving balances", async () => {
    const { service, repo, collections } = harness();
    collections.checkStatus = mock(async () =>
      intent({ status: "FAILED" }),
    ) as unknown as PaymentCollectionsService["checkStatus"];

    const result = await service.checkStatus("cust-1", "pay-1");

    expect(repo.applyConfirmedCollection).not.toHaveBeenCalled();
    expect(repo.setInstallmentPaymentStatus).toHaveBeenCalledWith(
      "pay-1",
      "FAILED",
    );
    expect(result.installmentPayment).toBeDefined();
  });

  it("credits a succeeded intent through compare-and-swap", async () => {
    const { service, repo, collections } = harness();
    collections.checkStatus = mock(async () =>
      intent({ status: "SUCCEEDED", paidAt: NOW }),
    ) as unknown as PaymentCollectionsService["checkStatus"];

    await service.checkStatus("cust-1", "pay-1");

    expect(repo.applyConfirmedCollection).toHaveBeenCalledTimes(1);
  });

  it("hides payments owned by another customer", async () => {
    const { service, repo } = harness();
    repo.findInstallmentPaymentById = mock(async () =>
      payment({ customerId: "someone-else" }),
    );
    await expectStatus(service.checkStatus("cust-1", "pay-1"), 404);
  });
});

describe("InstallmentPaymentsService.recordManualPayment", () => {
  it("requires a transaction reference and a reason", async () => {
    const { service } = harness();
    await expectStatus(
      service.recordManualPayment(
        { userId: "admin-1" },
        {
          agreementId: "agr-1",
          scheduleId: "sch-1",
          amountMinor: 50_000n,
          transactionReference: "",
          reason: "cash",
        },
      ),
      422,
    );
    await expectStatus(
      service.recordManualPayment(
        { userId: "admin-1" },
        {
          agreementId: "agr-1",
          scheduleId: "sch-1",
          amountMinor: 50_000n,
          transactionReference: "bank-1",
          reason: "",
        },
      ),
      422,
    );
  });

  it("records the payment and writes an audit entry", async () => {
    const { service, repo } = harness();
    const result = await service.recordManualPayment(
      { userId: "admin-1" },
      {
        agreementId: "agr-1",
        scheduleId: "sch-1",
        amountMinor: 50_000n,
        transactionReference: "bank-1",
        reason: "Bank transfer received",
      },
    );

    expect(repo.createInstallmentPayment).toHaveBeenCalledWith(
      expect.objectContaining({ source: "MANUAL", transactionReference: "bank-1" }),
    );
    expect(repo.createAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "payment.manual_recorded",
      }),
    );
    expect(result.status).toBe("SUCCEEDED");
  });

  it("rejects an amount above the outstanding", async () => {
    const { service } = harness();
    await expectStatus(
      service.recordManualPayment(
        { userId: "admin-1" },
        {
          agreementId: "agr-1",
          scheduleId: "sch-1",
          amountMinor: 60_000n,
          transactionReference: "bank-1",
          reason: "Bank transfer received",
        },
      ),
      422,
    );
  });
});
