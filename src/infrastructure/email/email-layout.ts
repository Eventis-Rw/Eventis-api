import { BRAND } from "./branding.js";

/**
 * Shared outer shell for every Eventis transactional email: logo header,
 * white rounded card, and footer tagline. Table-based with MSO conditionals
 * so it renders consistently in Outlook, Gmail, and mobile mail clients.
 * Callers supply only the HTML that goes inside the white card.
 */
export function renderEmailLayout(options: {
  subject: string;
  preheader: string;
  cardInnerHtml: string;
}): string {
  const { subject, preheader, cardInnerHtml } = options;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.background};color:${BRAND.ink};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:${BRAND.background};max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.background};">
    <tr><td align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="520" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td style="padding:0 8px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="40" height="40" align="center" valign="middle" style="border-radius:12px;">
              <img src="${BRAND.logoUrl}" width="40" height="40" alt="${BRAND.appName}" style="display:block;border-radius:12px;border:0;outline:none;">
            </td>
            <td style="padding-left:12px;font-size:25px;letter-spacing:-1px;font-weight:bold;color:${BRAND.ink};">${BRAND.appName}</td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid ${BRAND.cardBorder};border-radius:24px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            ${cardInnerHtml}
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 12px 0;font-size:12px;line-height:22px;color:${BRAND.mutedLight};"><strong style="color:${BRAND.muted};">${BRAND.tagline}</strong><br>The ${BRAND.appName} team</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
}

/** A pill-style label, e.g. "EMAIL VERIFICATION" or "PAYMENT UPDATE". */
export function renderBadge(label: string): string {
  return `<span style="display:inline-block;padding:7px 11px;border-radius:20px;background-color:${BRAND.badgeBg};color:${BRAND.primaryDark};font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.4px;">${escapeHtml(label)}</span>`;
}

/** A solid call-to-action button. Plain <a>, no JavaScript. */
export function renderButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${BRAND.primary}" style="border-radius:10px;">
    <a href="${escapeAttribute(href)}" style="display:inline-block;padding:13px 24px;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}
