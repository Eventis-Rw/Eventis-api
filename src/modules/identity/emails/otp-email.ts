import { BRAND } from "../../../infrastructure/email/branding.js";
import { renderBadge, renderEmailLayout } from "../../../infrastructure/email/email-layout.js";

/** Self-contained transactional email: no JavaScript, no tracking pixels. */
export function buildOtpEmail(code: string, purpose: "login" | "register") {
  if (!/^\d{6}$/.test(code)) throw new TypeError("OTP must contain six digits");
  const registering = purpose === "register";
  const subject = registering
    ? `${code} · Verify your email with Eventis`
    : `${code} · Your Eventis sign-in code`;
  const title = registering ? "You’re almost in." : "Welcome back.";
  const instruction = registering
    ? "You're receiving this because you started creating an Eventis account with this email address. Enter this code in Eventis to verify your email and finish creating your account."
    : "You're receiving this because someone requested a sign-in code for this email address. Enter this code in Eventis to securely sign in to your account.";
  const textContent = `${BRAND.appName}\n\n${title}\n\n${instruction}\n\nYour verification code is ${code}.\n\nThis code expires in 5 minutes. Never share this code with anyone — ${BRAND.appName} staff will never ask for it.\n\nIf you didn’t request this email, you can safely ignore it.\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;

  const cardInnerHtml = `
            <tr><td style="padding:36px 28px 0;">
              ${renderBadge("EMAIL VERIFICATION")}
              <h1 style="margin:24px 0 12px;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:-1px;color:${BRAND.ink};">${title}</h1>
              <p style="margin:0;font-size:16px;line-height:26px;color:${BRAND.muted};">${instruction}</p>
            </td></tr>
            <tr><td style="padding:28px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.tint}" style="background-color:${BRAND.tint};border:1px solid #bae6fd;border-radius:16px;">
                <tr><td align="center" style="padding:22px 12px 8px;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;color:${BRAND.primaryDark};">YOUR VERIFICATION CODE</td></tr>
                <tr><td align="center" style="padding:0 8px 6px;"><span style="-webkit-user-select:all;user-select:all;font-family:'Courier New',Courier,monospace;font-size:36px;line-height:48px;font-weight:bold;letter-spacing:5px;color:${BRAND.ink};white-space:nowrap;">${code}</span></td></tr>
                <tr><td align="center" style="padding:0 12px 10px;font-size:12px;line-height:18px;color:${BRAND.muted};">Tap and hold (or double-click) the code to select and copy it</td></tr>
                <tr><td align="center" style="padding:0 12px 22px;font-size:13px;line-height:20px;color:${BRAND.muted};">Valid for <strong style="color:${BRAND.ink};">5 minutes</strong></td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:24px 28px 32px;">
              <p style="margin:0 0 20px;font-size:13px;line-height:21px;color:${BRAND.muted};">For your security, never share this code with anyone. ${BRAND.appName} staff will never ask you for it, by email, phone, or chat.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${BRAND.divider};padding-top:20px;font-size:12px;line-height:20px;color:${BRAND.mutedLight};">Didn’t request this email? You can safely ignore it.</td></tr></table>
            </td></tr>`;

  const htmlContent = renderEmailLayout({
    subject,
    preheader: `${code} is your Eventis verification code. It expires in 5 minutes.`,
    cardInnerHtml,
  });

  return { subject, htmlContent, textContent };
}
