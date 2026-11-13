import { describe, expect, it } from "bun:test";

import {
  agreementStatusForSchedules,
  canTransitionAgreement,
  isEarlySchedule,
  isScheduleOverdue,
  recomputeAgreementBalances,
  scheduleStatusForOutstanding,
} from "./installment-agreement.js";

describe("canTransitionAgreement", () => {
  it("allows the documented forward transitions", () => {
    expect(canTransitionAgreement("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionAgreement("ACTIVE", "COMPLETED")).toBe(true);
    expect(canTransitionAgreement("ACTIVE", "SUSPENDED")).toBe(true);
    expect(canTransitionAgreement("OVERDUE", "ACTIVE")).toBe(true);
  });

  it("treats terminal states as immutable", () => {
    expect(canTransitionAgreement("COMPLETED", "ACTIVE")).toBe(false);
    expect(canTransitionAgreement("CANCELLED", "ACTIVE")).toBe(false);
  });

  it("rejects skipping from draft straight to completed", () => {
    expect(canTransitionAgreement("DRAFT", "COMPLETED")).toBe(false);
  });
});

describe("agreementStatusForSchedules", () => {
  it("completes when every open schedule is paid", () => {
    expect(
      agreementStatusForSchedules(
        [{ status: "PAID" }, { status: "PAID" }],
        "ACTIVE",
      ),
    ).toBe("COMPLETED");
  });

  it("completes when the only remaining schedules are waived or cancelled", () => {
    expect(
      agreementStatusForSchedules(
        [{ status: "PAID" }, { status: "WAIVED" }],
        "ACTIVE",
      ),
    ).toBe("COMPLETED");
  });

  it("marks overdue when any open schedule is overdue", () => {
    expect(
      agreementStatusForSchedules(
        [{ status: "PAID" }, { status: "OVERDUE" }],
        "ACTIVE",
      ),
    ).toBe("OVERDUE");
  });

  it("returns to active when overdue schedules are settled", () => {
    expect(
      agreementStatusForSchedules(
        [{ status: "PAID" }, { status: "PENDING" }],
        "OVERDUE",
      ),
    ).toBe("ACTIVE");
  });

  it("keeps a suspended agreement suspended", () => {
    expect(
      agreementStatusForSchedules([{ status: "PENDING" }], "SUSPENDED"),
    ).toBe("SUSPENDED");
  });

  it("never resurrects a terminal agreement", () => {
    expect(
      agreementStatusForSchedules([{ status: "OVERDUE" }], "CANCELLED"),
    ).toBe("CANCELLED");
  });
});

describe("recomputeAgreementBalances", () => {
  it("sums paid, refunded, late fees and outstanding from schedule rows", () => {
    const balances = recomputeAgreementBalances([
      {
        status: "PARTIALLY_PAID",
        amountDueMinor: 50_000n,
        amountPaidMinor: 20_000n,
        refundedAmountMinor: 0n,
        lateFeeAmountMinor: 500n,
      },
      {
        status: "PAID",
        amountDueMinor: 50_000n,
        amountPaidMinor: 50_000n,
        refundedAmountMinor: 10_000n,
        lateFeeAmountMinor: 0n,
      },
      {
        status: "WAIVED",
        amountDueMinor: 50_000n,
        amountPaidMinor: 0n,
        refundedAmountMinor: 0n,
        lateFeeAmountMinor: 0n,
      },
    ]);

    expect(balances).toEqual({
      amountPaidMinor: 70_000n,
      refundedAmountMinor: 10_000n,
      lateFeesTotalMinor: 500n,
      // The refund reopens 10k on the fully-paid schedule, plus 30k unpaid.
      outstandingBalanceMinor: 40_000n,
    });
  });

  it("reopens outstanding when a paid schedule is refunded", () => {
    const balances = recomputeAgreementBalances([
      {
        status: "PAID",
        amountDueMinor: 10_000n,
        amountPaidMinor: 10_000n,
        refundedAmountMinor: 4_000n,
        lateFeeAmountMinor: 0n,
      },
    ]);
    expect(balances.outstandingBalanceMinor).toBe(4_000n);
  });
});

describe("scheduleStatusForOutstanding", () => {
  it("is paid at zero outstanding", () => {
    expect(scheduleStatusForOutstanding(0n, true)).toBe("PAID");
  });

  it("is partially paid whenever anything remains", () => {
    expect(scheduleStatusForOutstanding(1n, true)).toBe("PARTIALLY_PAID");
  });
});

describe("isScheduleOverdue", () => {
  it("is overdue only after the grace period elapses", () => {
    const due = new Date("2026-01-01T00:00:00.000Z");
    expect(
      isScheduleOverdue(
        { dueDate: due },
        2,
        new Date("2026-01-02T23:59:59.000Z"),
      ),
    ).toBe(false);
    expect(
      isScheduleOverdue(
        { dueDate: due },
        2,
        new Date("2026-01-03T00:00:01.000Z"),
      ),
    ).toBe(true);
  });
});

describe("isEarlySchedule", () => {
  const schedules = [
    { id: "a", installmentNumber: 1, status: "PENDING" as const },
    { id: "b", installmentNumber: 2, status: "PENDING" as const },
  ];

  it("flags paying a later schedule while an earlier one is unpaid", () => {
    expect(isEarlySchedule(schedules, "b")).toBe(true);
  });

  it("does not flag the earliest unpaid schedule", () => {
    expect(isEarlySchedule(schedules, "a")).toBe(false);
  });

  it("does not flag a later schedule once earlier ones are settled", () => {
    expect(
      isEarlySchedule(
        [
          { id: "a", installmentNumber: 1, status: "PAID" as const },
          { id: "b", installmentNumber: 2, status: "PENDING" as const },
        ],
        "b",
      ),
    ).toBe(false);
  });
});
