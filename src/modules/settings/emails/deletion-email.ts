import { BRAND } from "../../../infrastructure/email/branding.js";
import { renderBadge, renderEmailLayout } from "../../../infrastructure/email/email-layout.js";

/** Mirrors the OTP email's design so every verification-code email in Eventis looks the same. */
export function buildAccountDeletionCodeEmail(code: string) {
  if (!/^\d{6}$/.test(code)) throw new TypeError("Deletion code must contain six digits");
  const subject = `Your ${BRAND.appName} account deletion code`;
  const textContent = `${BRAND.appName}\n\nYou requested to delete your ${BRAND.appName} account.\n\nYour confirmation code is ${code}.\n\nThis code expires in 10 minutes. Never share this code with anyone — ${BRAND.appName} staff will never ask for it.\n\nIf you didn’t request this, you can safely ignore this email and your account will not be deleted.\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;

  const cardInnerHtml = `
            <tr><td style="padding:36px 28px 0;">
              ${renderBadge("ACCOUNT DELETION")}
              <h1 style="margin:24px 0 12px;font-size:30px;line-height:38px;font-weight:bold;letter-spacing:-1px;color:${BRAND.ink};">Confirm account deletion</h1>
              <p style="margin:0;font-size:16px;line-height:26px;color:${BRAND.muted};">You're receiving this because a deletion was requested for your ${BRAND.appName} account using this email address. Enter this code in ${BRAND.appName} to permanently delete your account.</p>
            </td></tr>
            <tr><td style="padding:28px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.tint}" style="background-color:${BRAND.tint};border:1px solid #bae6fd;border-radius:16px;">
                <tr><td align="center" style="padding:22px 12px 8px;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;color:${BRAND.primaryDark};">YOUR CONFIRMATION CODE</td></tr>
                <tr><td align="center" style="padding:0 8px 6px;"><span style="-webkit-user-select:all;user-select:all;font-family:'Courier New',Courier,monospace;font-size:36px;line-height:48px;font-weight:bold;letter-spacing:5px;color:${BRAND.ink};white-space:nowrap;">${code}</span></td></tr>
                <tr><td align="center" style="padding:0 12px 10px;font-size:12px;line-height:18px;color:${BRAND.muted};">Tap and hold (or double-click) the code to select and copy it</td></tr>
                <tr><td align="center" style="padding:0 12px 22px;font-size:13px;line-height:20px;color:${BRAND.muted};">Valid for <strong style="color:${BRAND.ink};">10 minutes</strong></td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:24px 28px 32px;">
              <p style="margin:0 0 20px;font-size:13px;line-height:21px;color:${BRAND.muted};">For your security, never share this code with anyone. Deleting your account is permanent and cannot be undone.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${BRAND.divider};padding-top:20px;font-size:12px;line-height:20px;color:${BRAND.mutedLight};">Didn’t request this? You can safely ignore it — your account will not be deleted.</td></tr></table>
            </td></tr>`;

  const htmlContent = renderEmailLayout({
    subject,
    preheader: `Your account deletion code expires in 10 minutes.`,
    cardInnerHtml,
  });

  return { subject, htmlContent, textContent };
}
