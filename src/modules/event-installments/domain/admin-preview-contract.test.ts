import { describe, expect, it } from "bun:test";

import { preview, units } from "./admin-workspace.engine.js";
import { DEFAULT_TERMS } from "./admin-workspace.types.js";
import fixtures from "./fixtures/admin-previews.json" with { type: "json" };
import { generateSchedule } from "./installment-calculation.js";
import type { InstallmentFrequency } from "./installment-plan.js";
// Captured from the existing admin preview; UI behavior is the contract.
describe("admin preview compatibility", () => {
  for (const fixture of fixtures) {
    it(`workspace: ${fixture.name}`, () => {
      const rows = preview(
        {
          ...DEFAULT_TERMS,
          initial_payment: fixture.initial,
          installment_count: fixture.count,
          interest: fixture.interest,
          frequency: fixture.frequency as "monthly",
          interval: fixture.interval,
        },
        fixture.total,
        "RWF",
        fixture.start,
      );
      expect(
        rows.map((row) => ({
          amount_minor: String(units(row.amount, "RWF")),
          due_date: row.due_date,
          initial: row.initial,
        })),
      ).toEqual(fixture.expected);
    });
    it(fixture.name, () => {
      const rows = generateSchedule({
        totalAmountMinor: BigInt(fixture.total),
        initialPaymentMinor: BigInt(fixture.initial),
        installmentCount: fixture.count,
        interestRateBps: fixture.interest * 100,
        frequency: fixture.frequency.toUpperCase() as InstallmentFrequency,
        intervalCount: fixture.interval,
        startDate: new Date(`${fixture.start}T00:00:00Z`),
      });
      expect(
        rows.map((row) => ({
          amount_minor: String(row.amountDueMinor),
          due_date: row.dueDate.toISOString().slice(0, 10),
          initial: row.isInitialPayment,
        })),
      ).toEqual(fixture.expected);
    });
  }
});
