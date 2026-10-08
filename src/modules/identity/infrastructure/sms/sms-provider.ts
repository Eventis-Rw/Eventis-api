/**
 * SMS provider port. Application code depends on this interface only.
 * Africa's Talking (and the fake provider) live in infrastructure/.
 */
export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

export interface SendSmsInput {
  /** E.164 destination. */
  to: string;
  /** Full message body. Must not be logged by the provider. */
  message: string;
}

export interface SmsProvider {
  send(input: SendSmsInput): Promise<void>;
}

export function buildOtpSmsMessage(code: string): string {
  return `Your verification code is ${code}. This code expires in 5 minutes.`;
}
