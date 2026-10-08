/**
 * Optional smoke helper: request a real OTP via Africa's Talking.
 *
 * Usage (credentials must already be in the environment / .env):
 *
 *   SMS_PROVIDER=africas_talking AT_ENV=production \
 *     bun run scripts/smoke-otp-send.ts +250733958012
 *
 * Never commit API keys. Rotate any key that was pasted into chat.
 */
import { maskPhone } from "@eventis/contracts";

import { loadEnv } from "../src/config/env.js";
import { normalizeRwandaPhone } from "../src/modules/identity/domain/phone.js";
import { generateOtpCode } from "../src/modules/identity/domain/otp.js";
import { buildOtpSmsMessage } from "../src/modules/identity/infrastructure/sms/sms-provider.js";
import { AfricasTalkingSmsProvider } from "../src/modules/identity/infrastructure/sms/africas-talking.provider.js";

const rawPhone = process.argv[2];
if (!rawPhone) {
  console.error("Usage: bun run scripts/smoke-otp-send.ts <+2507XXXXXXXX>");
  process.exit(1);
}

const env = loadEnv();
if (env.SMS_PROVIDER !== "africas_talking") {
  console.error("Set SMS_PROVIDER=africas_talking to run this smoke test.");
  process.exit(1);
}

const phone = normalizeRwandaPhone(rawPhone);
const code = generateOtpCode();
const provider = new AfricasTalkingSmsProvider(env);

console.log(
  `Sending OTP SMS to ${maskPhone(phone)} via Africa's Talking (${env.AT_ENV ?? "auto"})…`,
);

await provider.send({
  to: phone,
  message: buildOtpSmsMessage(code),
});

console.log(
  "Africa's Talking accepted the message. Check the handset for the SMS.",
);
console.log(
  "This script does not print the OTP. Use the API verify flow with the code from the phone.",
);
