import { BRAND } from "../../../infrastructure/email/branding.js";
import { renderBadge, renderEmailLayout } from "../../../infrastructure/email/email-layout.js";

function greeting(displayName?: string | null): string {
  return displayName ? `Hi ${escapeHtml(displayName)},` : "Hi,";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function card(options: { badge: string; title: string; bodyHtml: string; footerHtml?: string }) {
  return `
            <tr><td style="padding:36px 28px 0;">
              ${renderBadge(options.badge)}
              <h1 style="margin:24px 0 16px;font-size:26px;line-height:34px;font-weight:bold;letter-spacing:-0.5px;color:${BRAND.ink};">${options.title}</h1>
            </td></tr>
            <tr><td style="padding:0 28px 28px;font-size:15px;line-height:24px;color:${BRAND.muted};">
              ${options.bodyHtml}
            </td></tr>
            ${
              options.footerHtml
                ? `<tr><td style="padding:0 28px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${BRAND.divider};padding-top:20px;font-size:12px;line-height:20px;color:${BRAND.mutedLight};">${options.footerHtml}</td></tr></table>
            </td></tr>`
                : ""
            }`;
}

export function buildPaymentSubmittedEmail(input: {
  displayName?: string | null;
  planName: string;
  amountLabel: string;
  reference: string;
}) {
  const subject = `We received your payment (${input.reference})`;
  const bodyHtml = `<p style="margin:0 0 14px;">${greeting(input.displayName)}</p>
              <p style="margin:0 0 14px;">We received your payment submission for <strong style="color:${BRAND.ink};">${escapeHtml(input.planName)}</strong> (${escapeHtml(input.amountLabel)}) and it's now waiting for review.</p>
              <p style="margin:0 0 14px;">Reference: <strong style="color:${BRAND.ink};">${escapeHtml(input.reference)}</strong></p>
              <p style="margin:0;">We'll email you as soon as it's approved or if we need anything else from you.</p>`;
  const htmlContent = renderEmailLayout({
    subject,
    preheader: `Your payment (${input.reference}) is awaiting review.`,
    cardInnerHtml: card({ badge: "PAYMENT RECEIVED", title: "We got your payment", bodyHtml }),
  });
  const textContent = `${BRAND.appName}\n\n${greeting(input.displayName)}\n\nWe received your payment submission for ${input.planName} (${input.amountLabel}) and it's now waiting for review.\n\nReference: ${input.reference}\n\nWe'll email you as soon as it's approved or if we need anything else from you.\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;
  return { subject, htmlContent, textContent };
}

export function buildPaymentApprovedEmail(input: {
  displayName?: string | null;
  planName: string;
  amountLabel: string;
  reference: string;
  verifiedAtIso: string;
  isOrganiser: boolean;
}) {
  const subject = `Your payment was approved (${input.reference})`;
  const statusLine = input.isOrganiser
    ? " New organiser applications now await a separate review."
    : " Your plan is now active.";
  const bodyHtml = `<p style="margin:0 0 14px;">${greeting(input.displayName)}</p>
              <p style="margin:0 0 14px;">Your payment for <strong style="color:${BRAND.ink};">${escapeHtml(input.planName)}</strong> has been verified.${statusLine}</p>
              <p style="margin:0;">Reference: <strong style="color:${BRAND.ink};">${escapeHtml(input.reference)}</strong><br>
              Amount: ${escapeHtml(input.amountLabel)}<br>
              Verified: ${escapeHtml(input.verifiedAtIso)}</p>`;
  const htmlContent = renderEmailLayout({
    subject,
    preheader: `Your payment (${input.reference}) was approved.`,
    cardInnerHtml: card({ badge: "PAYMENT APPROVED", title: "Payment verified", bodyHtml }),
  });
  const textContent = `${BRAND.appName}\n\n${greeting(input.displayName)}\n\nYour payment for ${input.planName} has been verified.${statusLine}\n\nReference: ${input.reference}\nAmount: ${input.amountLabel}\nVerified: ${input.verifiedAtIso}\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;
  return { subject, htmlContent, textContent };
}

export function buildPaymentRejectedEmail(input: {
  displayName?: string | null;
  planName: string;
  reference: string;
  rejectionReason: string;
}) {
  const subject = `Your payment could not be verified (${input.reference})`;
  const bodyHtml = `<p style="margin:0 0 14px;">${greeting(input.displayName)}</p>
              <p style="margin:0 0 14px;">We couldn't verify your payment for <strong style="color:${BRAND.ink};">${escapeHtml(input.planName)}</strong>.</p>
              <p style="margin:0 0 14px;">Reference: <strong style="color:${BRAND.ink};">${escapeHtml(input.reference)}</strong><br>
              Reason: ${escapeHtml(input.rejectionReason)}</p>
              <p style="margin:0;">You can submit a new payment at any time from the app.</p>`;
  const htmlContent = renderEmailLayout({
    subject,
    preheader: `Your payment (${input.reference}) could not be verified.`,
    cardInnerHtml: card({ badge: "PAYMENT NOT VERIFIED", title: "We couldn't verify this payment", bodyHtml }),
  });
  const textContent = `${BRAND.appName}\n\n${greeting(input.displayName)}\n\nWe couldn't verify your payment for ${input.planName}.\n\nReference: ${input.reference}\nReason: ${input.rejectionReason}\n\nYou can submit a new payment at any time from the app.\n\n${BRAND.tagline}\nThe ${BRAND.appName} team`;
  return { subject, htmlContent, textContent };
}
