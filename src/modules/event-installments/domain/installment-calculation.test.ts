import { describe, expect, it } from "bun:test";

import {
  addIntervals,
  computeAgreementTerms,
  generateSchedule,
  generateScheduleFromAmounts,
  netCollected,
  outstandingFor,
} from "./installment-calculation.js";
import { computeLateFeeAmount, initialPaymentFor } from "./installment-plan.js";

const start = new Date("2026-01-15T00:00:00.000Z");

describe("computeAgreementTerms", () => {
  it("applies simple interest on the financed principal, flooring to minor units", () => {
    const terms = computeAgreementTerms({
      totalAmountMinor: 100_000n,
      initialPaymentMinor: 20_000n,
      interestRateBps: 500,
      installmentCount: 4,
      frequency: "MONTHLY",
      intervalCount: 1,
      startDate: start,
    });
    expect(terms.financedAmountMinor).toBe(80_000n);
    expect(terms.interestAmountMinor).toBe(4_000n);
    expect(terms.totalPayableMinor).toBe(104_000n);
  });

  it("floors fractional interest rather than rounding up", () => {
    const terms = computeAgreementTerms({
      totalAmountMinor: 10_001n,
      initialPaymentMinor: 0n,
      interestRateBps: 1,
      installmentCount: 1,
      frequency: "MONTHLY",
      intervalCount: 1,
      startDate: start,
    });
    expect(terms.interestAmountMinor).toBe(1n);
  });

  it("rejects a negative rate and a non-positive total", () => {
    expect(() =>
      computeAgreementTerms({
        totalAmountMinor: 1_000n,
        initialPaymentMinor: 0n,
        interestRateBps: -1,
        installmentCount: 1,
        frequency: "MONTHLY",
        intervalCount: 1,
        startDate: start,
      }),
    ).toThrow();
    expect(() =>
      computeAgreementTerms({
        totalAmountMinor: 0n,
        initialPaymentMinor: 0n,
        interestRateBps: 0,
        installmentCount: 1,
        frequency: "MONTHLY",
        intervalCount: 1,
        startDate: start,
      }),
    ).toThrow();
  });
});

describe("generateSchedule", () => {
  it("puts the initial payment first, due on the start date", () => {
    const rows = generateSchedule({
      totalAmountMinor: 100_000n,
      initialPaymentMinor: 20_000n,
      interestRateBps: 0,
      installmentCount: 4,
      frequency: "MONTHLY",
      intervalCount: 1,
      startDate: start,
    });
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({
      installmentNumber: 1,
      isInitialPayment: true,
      amountDueMinor: 20_000n,
      interestAmountMinor: 0n,
    });
    expect(rows[0]?.dueDate.toISOString()).toBe(start.toISOString());
    expect(rows[1]).toMatchObject({
      installmentNumber: 2,
      isInitialPayment: false,
      amountDueMinor: 20_000n,
    });
  });

  it("reconciles exactly, absorbing the remainder on the last installment", () => {
    const rows = generateSchedule({
      totalAmountMinor: 100_000n,
      initialPaymentMinor: 0n,
      interestRateBps: 333,
      installmentCount: 3,
      frequency: "MONTHLY",
      intervalCount: 1,
      startDate: start,
    });
    const total = rows.reduce((sum, row) => sum + row.amountDueMinor, 0n);
    expect(total).toBe(100_000n + 3_330n);
    // financed payable 103330 / 3 = 34443.33 → last absorbs the remainder.
    expect(rows.map((row) => row.amountDueMinor)).toEqual([
      34_443n,
      34_443n,
      34_444n,
    ]);
  });

  it("never loses or invents money when the division is uneven", () => {
    const rows = generateSchedule({
      totalAmountMinor: 100_000n,
      initialPaymentMinor: 0n,
      interestRateBps: 0,
      installmentCount: 7,
      frequency: "WEEKLY",
      intervalCount: 1,
      startDate: start,
    });
    const total = rows.reduce((sum, row) => sum + row.amountDueMinor, 0n);
    expect(total).toBe(100_000n);
    const interestTotal = rows.reduce(
      (sum, row) => sum + row.interestAmountMinor,
      0n,
    );
    expect(interestTotal).toBe(0n);
    for (const row of rows) {
      expect(row.principalAmountMinor + row.interestAmountMinor).toBe(
        row.amountDueMinor,
      );
    }
  });

  it("generates from an explicit interest snapshot without touching a rate", () => {
    const rows = generateScheduleFromAmounts({
      totalAmountMinor: 50_000n,
      initialPaymentMinor: 10_000n,
      interestAmountMinor: 2_000n,
      installmentCount: 2,
      frequency: "MONTHLY",
      intervalCount: 1,
      startDate: start,
    });
    const total = rows.reduce((sum, row) => sum + row.amountDueMinor, 0n);
    expect(total).toBe(52_000n);
  });

  it("supports a zero initial payment", () => {
    const rows = generateSchedule({
      totalAmountMinor: 10_000n,
      initialPaymentMinor: 0n,
      interestRateBps: 0,
      installmentCount: 2,
      frequency: "MONTHLY",
      intervalCount: 1,
      startDate: start,
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.isInitialPayment).toBe(false);
  });

  it("rejects an initial payment larger than the total", () => {
    expect(() =>
      generateSchedule({
        totalAmountMinor: 10_000n,
        initialPaymentMinor: 10_001n,
        interestRateBps: 0,
        installmentCount: 2,
        frequency: "MONTHLY",
        intervalCount: 1,
        startDate: start,
      }),
    ).toThrow();
  });
});

describe("addIntervals", () => {
  it("clamps monthly arithmetic to the last day of the target month", () => {
    const jan31 = new Date("2026-01-31T00:00:00.000Z");
    const feb = addIntervals(jan31, 1, "MONTHLY", 1);
    expect(feb.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("handles leap-year February", () => {
    const jan31 = new Date("2028-01-31T00:00:00.000Z");
    expect(addIntervals(jan31, 1, "MONTHLY", 1).toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("adds weeks and years", () => {
    expect(addIntervals(start, 2, "WEEKLY", 1).toISOString()).toBe(
      "2026-01-29T00:00:00.000Z",
    );
    expect(addIntervals(start, 1, "YEARLY", 1).toISOString()).toBe(
      "2027-01-15T00:00:00.000Z",
    );
  });

  it("clamps Feb 29 to Feb 28 on a non-leap target year", () => {
    const leapDay = new Date("2028-02-29T00:00:00.000Z");
    expect(addIntervals(leapDay, 1, "YEARLY", 1).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });

  it("honours the interval count", () => {
    expect(addIntervals(start, 1, "MONTHLY", 3).toISOString()).toBe(
      "2026-04-15T00:00:00.000Z",
    );
  });
});

describe("balances", () => {
  it("never returns a negative net collected amount", () => {
    expect(netCollected(1_000n, 1_500n)).toBe(0n);
    expect(netCollected(1_000n, 400n)).toBe(600n);
  });

  it("computes outstanding from due minus net collected", () => {
    expect(outstandingFor(1_000n, 400n, 100n)).toBe(700n);
    expect(outstandingFor(1_000n, 1_000n, 0n)).toBe(0n);
    expect(outstandingFor(1_000n, 1_000n, 200n)).toBe(200n);
  });
});

describe("plan helpers", () => {
  it("computes a FIXED initial payment capped at the total", () => {
    expect(
      initialPaymentFor(
        { initialPaymentType: "FIXED", initialPaymentValue: 5_000n },
        100_000n,
      ),
    ).toBe(5_000n);
    expect(
      initialPaymentFor(
        { initialPaymentType: "FIXED", initialPaymentValue: 200_000n },
        100_000n,
      ),
    ).toBe(100_000n);
  });

  it("computes a PERCENT initial payment in basis points", () => {
    expect(
      initialPaymentFor(
        { initialPaymentType: "PERCENT", initialPaymentValue: 2_500n },
        100_000n,
      ),
    ).toBe(25_000n);
  });

  it("computes late fees for FIXED and PERCENT", () => {
    expect(
      computeLateFeeAmount({ feeType: "FIXED", value: 1_000n }, 50_000n),
    ).toBe(1_000n);
    expect(
      computeLateFeeAmount({ feeType: "PERCENT", value: 500n }, 50_000n),
    ).toBe(2_500n);
  });

  it("returns zero for a non-positive amount due", () => {
    expect(
      computeLateFeeAmount({ feeType: "PERCENT", value: 500n }, 0n),
    ).toBe(0n);
  });
});
