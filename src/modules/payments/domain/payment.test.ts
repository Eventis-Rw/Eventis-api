import { describe, expect, it } from "bun:test";

import {
  daysRemaining,
  defaultDurationDays,
  fromApiAccountType,
  fromApiInterval,
  fromApiPaymentMethod,
  isPendingPaymentStatus,
  isTerminalPaymentStatus,
  paymentMethodForPhone,
  phoneMatchesPaymentMethod,
  providerStatusToPaymentStatus,
  subscriptionExpiry,
  toApiAccountType,
  toApiInterval,
  toApiPaymentMethod,
  toPublicPaymentStatus,
} from "./payment.js";

describe("payment domain", () => {
  it("maps provider statuses to public statuses", () => {
    expect(toPublicPaymentStatus("CREATED")).toBe("pending");
    expect(toPublicPaymentStatus("AWAITING_USER")).toBe("pending");
    expect(toPublicPaymentStatus("SUCCEEDED")).toBe("succeeded");
    expect(toPublicPaymentStatus("FAILED")).toBe("failed");
    expect(toPublicPaymentStatus("CANCELLED")).toBe("cancelled");
    expect(toPublicPaymentStatus("EXPIRED")).toBe("expired");
    expect(toPublicPaymentStatus("UNKNOWN")).toBe("unknown");
  });

  it("maps provider payment statuses and keeps unknown distinct", () => {
    expect(providerStatusToPaymentStatus("PENDING")).toBe("AWAITING_USER");
    expect(providerStatusToPaymentStatus("SUCCEEDED")).toBe("SUCCEEDED");
    expect(providerStatusToPaymentStatus("FAILED")).toBe("FAILED");
    expect(providerStatusToPaymentStatus("CANCELLED")).toBe("CANCELLED");
    expect(providerStatusToPaymentStatus("UNKNOWN")).toBe("UNKNOWN");
  });

  it("classifies terminal and pending statuses", () => {
    expect(isTerminalPaymentStatus("SUCCEEDED")).toBe(true);
    expect(isTerminalPaymentStatus("CANCELLED")).toBe(true);
    expect(isTerminalPaymentStatus("UNKNOWN")).toBe(false);
    expect(isPendingPaymentStatus("UNKNOWN")).toBe(true);
    expect(isPendingPaymentStatus("AWAITING_USER")).toBe(true);
    expect(isPendingPaymentStatus("EXPIRED")).toBe(false);
  });

  it("detects Rwanda mobile money networks", () => {
    expect(paymentMethodForPhone("+250788123456")).toBe("MTN_MOMO");
    expect(paymentMethodForPhone("+250799123456")).toBe("MTN_MOMO");
    expect(paymentMethodForPhone("+250721123456")).toBe("AIRTEL_MONEY");
    expect(paymentMethodForPhone("+250731123456")).toBe("AIRTEL_MONEY");
    expect(paymentMethodForPhone("+250751123456")).toBeNull();
    expect(phoneMatchesPaymentMethod("+250788123456", "MTN_MOMO")).toBe(true);
    expect(phoneMatchesPaymentMethod("+250788123456", "AIRTEL_MONEY")).toBe(
      false,
    );
  });

  it("uses plan durations and extends active subscriptions", () => {
    const now = new Date("2026-10-30T10:00:00.000Z");
    expect(defaultDurationDays("WEEKLY")).toBe(7);
    expect(defaultDurationDays("MONTHLY")).toBe(30);
    expect(defaultDurationDays("YEARLY")).toBe(365);

    expect(
      subscriptionExpiry(now, 30, new Date("2026-11-10T10:00:00.000Z")),
    ).toEqual(new Date("2026-12-10T10:00:00.000Z"));
    expect(
      subscriptionExpiry(now, 7, new Date("2026-10-01T10:00:00.000Z")),
    ).toEqual(new Date("2026-11-06T10:00:00.000Z"));
    expect(daysRemaining(new Date("2026-11-01T10:00:00.000Z"), now)).toBe(2);
    expect(daysRemaining(new Date("2026-10-29T10:00:00.000Z"), now)).toBe(0);
  });

  it("round-trips API enum values", () => {
    expect(toApiAccountType(fromApiAccountType("private"))).toBe("private");
    expect(toApiAccountType(fromApiAccountType("public"))).toBe("public");
    expect(toApiInterval(fromApiInterval("weekly"))).toBe("weekly");
    expect(toApiInterval(fromApiInterval("monthly"))).toBe("monthly");
    expect(toApiInterval(fromApiInterval("yearly"))).toBe("yearly");
    expect(toApiPaymentMethod(fromApiPaymentMethod("mtn_momo"))).toBe(
      "mtn_momo",
    );
    expect(toApiPaymentMethod(fromApiPaymentMethod("airtel_money"))).toBe(
      "airtel_money",
    );
  });
});
