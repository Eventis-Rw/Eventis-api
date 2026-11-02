import { maskPhone } from "@eventis/contracts";
import { Injectable, Logger } from "@nestjs/common";

import type { SendSmsInput, SmsProvider } from "./sms-provider.js";

@Injectable()
export class FakeSmsProvider implements SmsProvider {
  readonly sent: SendSmsInput[] = [];
  private readonly logger = new Logger(FakeSmsProvider.name);

  send(input: SendSmsInput): Promise<void> {
    this.sent.push(input);

    this.logger.debug(`fake SMS queued for ${maskPhone(input.to)}`);
    return Promise.resolve();
  }

  clear(): void {
    this.sent.length = 0;
  }

  lastOtpCode(): string | null {
    const last = this.sent.at(-1);
    if (!last) return null;
    const match = /(?:code is|is)\s+(\d{6})/i.exec(last.message);
    return match?.[1] ?? null;
  }
}
