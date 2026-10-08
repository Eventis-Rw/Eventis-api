import { Injectable, Logger } from "@nestjs/common";

import { maskPhone } from "@eventis/contracts";

import type { SendSmsInput, SmsProvider } from "./sms-provider.js";

/**
 * Development / test SMS sink. Never hits a network.
 * Tests can inspect `sent` to assert delivery without seeing codes in production logs.
 */
@Injectable()
export class FakeSmsProvider implements SmsProvider {
  readonly sent: SendSmsInput[] = [];
  private readonly logger = new Logger(FakeSmsProvider.name);

  async send(input: SendSmsInput): Promise<void> {
    this.sent.push(input);
    // Intentionally do not log the message body — it contains the OTP.
    this.logger.debug(`fake SMS queued for ${maskPhone(input.to)}`);
  }

  clear(): void {
    this.sent.length = 0;
  }

  /** Test helper: extract the last OTP from the last message, if present. */
  lastOtpCode(): string | null {
    const last = this.sent.at(-1);
    if (!last) return null;
    const match = /(?:code is|is)\s+(\d{6})/i.exec(last.message);
    return match?.[1] ?? null;
  }
}
