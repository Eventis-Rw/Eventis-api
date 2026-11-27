import { describe, expect, it } from "bun:test";

import {
  buildPaymentApprovedEmail,
  buildPaymentRejectedEmail,
  buildPaymentSubmittedEmail,
} from "./payment-emails.js";

describe("payment emails", () => {
  it("builds a submitted-payment email with the plan, amount and reference", () => {
    const email = buildPaymentSubmittedEmail({
      displayName: "Aline",
      planName: "Organiser Monthly",
      amountLabel: "RWF 10,000",
      reference: "PAY-123",
    });
    expect(email.subject).toContain("PAY-123");
    expect(email.htmlContent).toContain("Aline");
    expect(email.htmlContent).toContain("Organiser Monthly");
    expect(email.htmlContent).toContain("RWF 10,000");
  });

  it("builds an approved-payment email noting organiser follow-up review", () => {
    const email = buildPaymentApprovedEmail({
      displayName: null,
      planName: "Organiser Monthly",
      amountLabel: "RWF 10,000",
      reference: "PAY-123",
      verifiedAtIso: "2026-11-26T00:00:00.000Z",
      isOrganiser: true,
    });
    expect(email.htmlContent).toContain("await a separate review");
  });

  it("builds a rejected-payment email with the reason", () => {
    const email = buildPaymentRejectedEmail({
      displayName: "Aline",
      planName: "Organiser Monthly",
      reference: "PAY-123",
      rejectionReason: "Receipt was unreadable",
    });
    expect(email.htmlContent).toContain("Receipt was unreadable");
  });
});
