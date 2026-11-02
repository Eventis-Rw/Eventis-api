import { ERROR_CODES, maskPhone } from "@eventis/contracts";
import { Inject, Injectable, Logger } from "@nestjs/common";

import { AppError } from "../../../../common/errors/app-error.js";
import { ENV, type Env } from "../../../../config/env.js";

import type { SendSmsInput, SmsProvider } from "./sms-provider.js";

@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  private resolveEndpoint(): string {
    const mode =
      this.env.AT_ENV ??
      (this.env.AT_USERNAME === "sandbox" ? "sandbox" : "production");
    return mode === "sandbox"
      ? "https://api.sandbox.africastalking.com/version1/messaging"
      : "https://api.africastalking.com/version1/messaging";
  }

  async send(input: SendSmsInput): Promise<void> {
    const username = this.env.AT_USERNAME;
    const apiKey = this.env.AT_API_KEY ?? this.env.SMS_API_KEY;
    if (!username || !apiKey) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "SMS is not configured",
        500,
        { internal: { reason: "missing AT credentials" } },
      );
    }

    const endpoint = this.resolveEndpoint();
    const body = new URLSearchParams({
      username,
      to: input.to,
      message: input.message,
    });

    if (this.env.AT_SENDER_ID) {
      body.set("from", this.env.AT_SENDER_ID);
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey,
        },
        body,
      });
    } catch (cause) {
      this.logger.error(
        { err: cause, to: maskPhone(input.to) },
        "Africa's Talking request failed",
      );
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "Unable to send verification code",
        502,
        { cause, internal: { provider: "africas_talking" } },
      );
    }

    const responseText = await response.text();
    if (!response.ok) {
      this.logger.warn(
        {
          status: response.status,
          to: maskPhone(input.to),
          mode: this.env.AT_ENV ?? "auto",
        },
        "Africa's Talking rejected SMS",
      );
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "Unable to send verification code",
        502,
        { internal: { status: response.status } },
      );
    }

    try {
      const parsed = JSON.parse(responseText) as {
        SMSMessageData?: {
          Recipients?: Array<{ statusCode?: number; status?: string }>;
        };
      };
      const recipients = parsed.SMSMessageData?.Recipients ?? [];
      const failed = recipients.filter(
        (r) => typeof r.statusCode === "number" && r.statusCode >= 400,
      );
      if (recipients.length > 0 && failed.length === recipients.length) {
        this.logger.warn(
          { to: maskPhone(input.to), status: failed[0]?.status },
          "Africa's Talking could not deliver SMS",
        );
        throw new AppError(
          ERROR_CODES.INTERNAL_ERROR,
          "Unable to send verification code",
          502,
          { internal: { delivery: failed[0]?.status } },
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
    }

    this.logger.log(
      `SMS accepted by Africa's Talking for ${maskPhone(input.to)}`,
    );
  }
}
