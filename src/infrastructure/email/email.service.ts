import { Inject, Injectable, Logger } from "@nestjs/common";

import { EmailQueue } from "./email-queue.js";
import { EMAIL_PROVIDER, type EmailProvider, type SendEmailInput } from "./email-provider.js";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly provider: EmailProvider,
    private readonly queue: EmailQueue,
  ) {}

  /**
   * Enqueues the email for retried, asynchronous delivery and returns
   * immediately. Use this after a transaction/state change has already
   * committed — a flaky email provider can never roll back or block the
   * thing the email is about, and BullMQ retries failed attempts with
   * backoff. Pass `jobId` (e.g. `payment-approved:<id>`) so retrying the
   * caller's own action can never result in a duplicate email.
   */
  async sendBestEffort(input: SendEmailInput, jobId?: string): Promise<void> {
    await this.queue.enqueue(input, jobId);
  }

  /** Sends immediately and throws on failure. For flows that must block the HTTP response (e.g. OTP). */
  async send(input: SendEmailInput): Promise<void> {
    await this.provider.send(input);
  }

  /** Like `send`, but retries once more after a short delay before giving up. */
  async sendWithRetry(
    input: SendEmailInput,
    options: { attempts?: number; delayMs?: number } = {},
  ): Promise<void> {
    const attempts = Math.max(1, options.attempts ?? 2);
    const delayMs = options.delayMs ?? 1000;
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        await this.provider.send(input);
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          { err, to: input.to, subject: input.subject, attempt, attempts },
          "Email send attempt failed",
        );
        if (attempt < attempts) await delay(delayMs);
      }
    }
    throw lastError;
  }
}
