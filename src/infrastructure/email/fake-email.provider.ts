import { Injectable, Logger } from "@nestjs/common";

import type { EmailProvider, SendEmailInput } from "./email-provider.js";

@Injectable()
export class FakeEmailProvider implements EmailProvider {
  readonly sent: SendEmailInput[] = [];
  private readonly logger = new Logger(FakeEmailProvider.name);

  send(input: SendEmailInput): Promise<void> {
    this.sent.push(input);
    this.logger.debug(`fake email queued for ${input.to}: ${input.subject}`);
    return Promise.resolve();
  }

  clear(): void {
    this.sent.length = 0;
  }
}
