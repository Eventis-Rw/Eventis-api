import { Inject, Injectable, Logger } from "@nestjs/common";

import { EMAIL_PROVIDER, type EmailProvider, type SendEmailInput } from "./email-provider.js";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider) {}

  /**
   * A failed send is logged, never thrown. Callers run this after their own
   * transaction/state change has already committed, so a flaky email
   * provider can never roll back or block the thing the email is about.
   */
  async sendBestEffort(input: SendEmailInput): Promise<void> {
    try {
      await this.provider.send(input);
    } catch (err) {
      this.logger.error(
        { err, to: input.to, subject: input.subject },
        "Email send failed; continuing without it",
      );
    }
  }
}
