export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

export interface SendSmsInput {
  to: string;

  message: string;
}

export interface SmsProvider {
  send(input: SendSmsInput): Promise<void>;
}

export function buildOtpSmsMessage(code: string): string {
  return `Your verification code is ${code}. This code expires in 5 minutes.`;
}
