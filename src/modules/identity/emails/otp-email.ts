/** Self-contained transactional email: no remote images, fonts, or tracking. */
export function buildOtpEmail(code: string, purpose: "login" | "register") {
  if (!/^\d{6}$/.test(code)) throw new TypeError("OTP must contain six digits");
  const registering = purpose === "register";
  const subject = registering
    ? "Verify your email with Eventis"
    : "Your Eventis sign-in code";
  const title = registering ? "You’re almost in." : "Welcome back.";
  const instruction = registering
    ? "Enter this code in Eventis to verify your email and finish creating your account."
    : "Enter this code in Eventis to securely sign in to your account.";
  const textContent = `Eventis\n\n${title}\n\n${instruction}\n\nYour verification code is ${code}.\n\nThis code expires in 5 minutes. Never share this code with anyone.\n\nIf you didn’t request this email, you can safely ignore it.\n\nDiscover. Connect. Experience.\nThe Eventis team`;
  const htmlContent = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f0f4fa;color:#0a1022;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
  <div style="display:none;font-size:1px;line-height:1px;color:#f0f4fa;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your Eventis verification code expires in 5 minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4fa;">
    <tr><td align="center" style="padding:40px 16px;">
      <!--[if mso]><table role="presentation" width="520" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td style="padding:0 8px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
            <td width="40" height="40" align="center" bgcolor="#0284c7" style="border-radius:12px;font-size:25px;line-height:40px;font-weight:bold;color:#ffffff;">e<span style="color:#bae6fd;">.</span></td>
            <td style="padding-left:12px;font-size:25px;letter-spacing:-1px;font-weight:bold;color:#0a1022;">Eventis</td>
          </tr></table>
        </td></tr>
        <tr><td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #dfe7f1;border-radius:24px;overflow:hidden;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:36px 28px 0;">
              <span style="display:inline-block;padding:7px 11px;border-radius:20px;background-color:#e0f2fe;color:#0369a1;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:1.4px;">EMAIL VERIFICATION</span>
              <h1 style="margin:24px 0 12px;font-size:32px;line-height:40px;font-weight:bold;letter-spacing:-1px;color:#0a1022;">${title}</h1>
              <p style="margin:0;font-size:16px;line-height:26px;color:#5c6478;">${instruction}</p>
            </td></tr>
            <tr><td style="padding:28px 28px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f9ff" style="background-color:#f0f9ff;border:1px solid #bae6fd;border-radius:16px;">
                <tr><td align="center" style="padding:22px 12px 8px;font-size:11px;line-height:16px;font-weight:bold;letter-spacing:2px;color:#0369a1;">YOUR VERIFICATION CODE</td></tr>
                <tr><td align="center" style="padding:0 8px 14px;"><span style="font-family:'Courier New',Courier,monospace;font-size:36px;line-height:48px;font-weight:bold;letter-spacing:5px;color:#0a1022;white-space:nowrap;">${code}</span></td></tr>
                <tr><td align="center" style="padding:0 12px 22px;font-size:13px;line-height:20px;color:#5c6478;">Valid for <strong style="color:#0a1022;">5 minutes</strong></td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:24px 28px 32px;">
              <p style="margin:0 0 20px;font-size:13px;line-height:21px;color:#5c6478;">Keep this code to yourself. Eventis will never ask you to share it with anyone.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #e8edf4;padding-top:20px;font-size:12px;line-height:20px;color:#7b8496;">Didn’t request this email? You can safely ignore it.</td></tr></table>
            </td></tr>
          </table>
        </td></tr>
        <tr><td align="center" style="padding:24px 12px 0;font-size:12px;line-height:22px;color:#7b8496;"><strong style="color:#5c6478;">Discover. Connect. Experience.</strong><br>The Eventis team</td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`;
  return { subject, htmlContent, textContent };
}
