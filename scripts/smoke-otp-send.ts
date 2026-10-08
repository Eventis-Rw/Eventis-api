import { maskPhone } from "@eventis/contracts";

import { loadEnv } from "../src/config/env.js";
import { generateOtpCode } from "../src/modules/identity/domain/otp.js";
import { normalizeRwandaPhone } from "../src/modules/identity/domain/phone.js";
import { AfricasTalkingSmsProvider } from "../src/modules/identity/infrastructure/sms/africas-talking.provider.js";
import { buildOtpSmsMessage } from "../src/modules/identity/infrastructure/sms/sms-provider.js";

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

// eslint-disable-next-line no-console
console.log(
  `Sending OTP SMS to ${maskPhone(phone)} via Africa's Talking (${env.AT_ENV ?? "auto"})…`,
);

await provider.send({
  to: phone,
  message: buildOtpSmsMessage(code),
});

// eslint-disable-next-line no-console
console.log(
  "Africa's Talking accepted the message. Check the handset for the SMS.",
);
// eslint-disable-next-line no-console
console.log(
  "This script does not print the OTP. Use the API verify flow with the code from the phone.",
);
