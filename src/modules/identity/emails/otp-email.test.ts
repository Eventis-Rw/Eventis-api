import { describe, expect, it } from "bun:test";

import { buildOtpEmail } from "./otp-email.js";

describe("buildOtpEmail", () => {
  it("rejects a code that isn't exactly six digits", () => {
    expect(() => buildOtpEmail("12345", "login")).toThrow();
    expect(() => buildOtpEmail("1234567", "login")).toThrow();
  });

  it("renders a branded, selectable code block with expiry and security notice", () => {
    const { subject, htmlContent, textContent } = buildOtpEmail("482913", "login");
    expect(subject).toBe("482913 · Your Eventis sign-in code");
    expect(htmlContent).toContain("482913");
    expect(htmlContent).toContain("Valid for");
    expect(htmlContent).toContain("5 minutes");
    expect(htmlContent).toContain("never share this code");
    expect(htmlContent).toContain("user-select:all");
    expect(htmlContent).toContain("Eventis");
    expect(textContent).toContain("482913");
    expect(textContent).toContain("5 minutes");
  });

  it("uses register-specific copy for the register purpose", () => {
    const { subject, htmlContent } = buildOtpEmail("111222", "register");
    expect(subject).toBe("111222 · Verify your email with Eventis");
    expect(htmlContent).toContain("verify your email");
  });
});
