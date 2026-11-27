import { describe, expect, it } from "bun:test";

import { buildAccountDeletionCodeEmail } from "./deletion-email.js";

describe("buildAccountDeletionCodeEmail", () => {
  it("rejects a code that isn't exactly six digits", () => {
    expect(() => buildAccountDeletionCodeEmail("123")).toThrow();
  });

  it("renders the code with expiry and an irreversibility warning", () => {
    const { subject, htmlContent, textContent } = buildAccountDeletionCodeEmail("654321");
    expect(subject).toContain("deletion code");
    expect(htmlContent).toContain("654321");
    expect(htmlContent).toContain("10 minutes");
    expect(htmlContent).toContain("permanent");
    expect(textContent).toContain("654321");
  });
});
