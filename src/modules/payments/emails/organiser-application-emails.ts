import { BRAND } from "../../../infrastructure/email/branding.js";
import { renderBadge, renderEmailLayout } from "../../../infrastructure/email/email-layout.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildOrganiserApplicationInReviewEmail() {
  const subject = "Organiser application in review";
  const bodyHtml = `<p style="margin:0;">Your payment was verified and your organiser application is awaiting administrator review. We'll email you again as soon as a decision has been made.</p>`;
  const cardInnerHtml = `
            <tr><td style="padding:36px 28px 0;">
              ${renderBadge("ORGANISER APPLICATION")}
              <h1 style="margin:24px 0 16px;font-size:26px;line-height:34px;font-weight:bold;letter-spacing:-0.5px;color:${BRAND.ink};">Your application is in review</h1>
            </td></tr>
            <tr><td style="padding:0 28px 32px;font-size:15px;line-height:24px;color:${BRAND.muted};">
              ${bodyHtml}
            </td></tr>`;
  const htmlContent = renderEmailLayout({ subject, preheader: subject, cardInnerHtml });
  const textContent = `${BRAND.appName}\n\nYour payment was verified and your organiser application is awaiting administrator review. We'll email you again as soon as a decision has been made.\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;
  return { subject, htmlContent, textContent };
}

export function buildOrganiserApplicationDecisionEmail(input: {
  decision: "APPROVED" | "REJECTED";
  rejectionReason?: string | null;
}) {
  const approved = input.decision === "APPROVED";
  const subject = approved
    ? "Your organiser application was approved"
    : "Your organiser application was rejected";
  const bodyHtml = approved
    ? `<p style="margin:0;">Your organiser account was approved. Open ${BRAND.appName} to access your dashboard and start publishing events.</p>`
    : `<p style="margin:0 0 14px;">Your organiser application was rejected.</p>${
        input.rejectionReason
          ? `<p style="margin:0;">Reason: ${escapeHtml(input.rejectionReason)}</p>`
          : ""
      }`;
  const cardInnerHtml = `
            <tr><td style="padding:36px 28px 0;">
              ${renderBadge(approved ? "ORGANISER APPROVED" : "ORGANISER APPLICATION")}
              <h1 style="margin:24px 0 16px;font-size:26px;line-height:34px;font-weight:bold;letter-spacing:-0.5px;color:${BRAND.ink};">${approved ? "You're approved to organise events" : "Your application needs another look"}</h1>
            </td></tr>
            <tr><td style="padding:0 28px 32px;font-size:15px;line-height:24px;color:${BRAND.muted};">
              ${bodyHtml}
            </td></tr>`;
  const htmlContent = renderEmailLayout({ subject, preheader: subject, cardInnerHtml });
  const textContent = approved
    ? `${BRAND.appName}\n\nYour organiser account was approved. Open ${BRAND.appName} to access your dashboard and start publishing events.\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`
    : `${BRAND.appName}\n\nYour organiser application was rejected.${input.rejectionReason ? ` Reason: ${input.rejectionReason}` : ""}\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;
  return { subject, htmlContent, textContent };
}
