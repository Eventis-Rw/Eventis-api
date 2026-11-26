import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppError } from "../../common/errors/app-error.js";
import { ENV, type Env } from "../../config/env.js";

import type { EmailProvider, SendEmailInput } from "./email-provider.js";

@Injectable()
export class BrevoEmailProvider implements EmailProvider {
  /** Brevo must answer within this window or the request fails fast. */
  private static readonly REQUEST_TIMEOUT_MS = 10_000;
  private static readonly ENDPOINT = "https://api.brevo.com/v3/smtp/email";

  private readonly logger = new Logger(BrevoEmailProvider.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(input: SendEmailInput): Promise<void> {
    const apiKey = this.env.BREVO_API_KEY;
    const senderEmail = input.fromEmail ?? this.env.BREVO_SENDER_EMAIL;
    const senderName = input.fromName ?? this.env.BREVO_SENDER_NAME;
    if (!apiKey || !senderEmail) {
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, "Email is not configured", 500, {
        internal: { reason: "missing Brevo credentials" },
      });
    }

    let response: Response;
    try {
      response = await fetch(BrevoEmailProvider.ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender: {
            email: senderEmail,
            ...(senderName ? { name: senderName } : {}),
          },
          to: [{ email: input.to }],
          subject: input.subject,
          htmlContent: input.html,
          ...(input.text ? { textContent: input.text } : {}),
        }),
        signal: AbortSignal.timeout(BrevoEmailProvider.REQUEST_TIMEOUT_MS),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      this.logger.error({ err: cause, to: input.to, timedOut }, "Brevo request failed");
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, "Unable to send email", 502, {
        cause,
        internal: { provider: "brevo" },
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      this.logger.warn({ status: response.status, to: input.to, body }, "Brevo rejected email");
      throw new AppError(ERROR_CODES.INTERNAL_ERROR, "Unable to send email", 502, {
        internal: { status: response.status },
      });
    }
  }
}
