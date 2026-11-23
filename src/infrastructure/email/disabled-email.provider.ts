import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";

import { AppError } from "../../common/errors/app-error.js";

import type { EmailProvider } from "./email-provider.js";

@Injectable()
export class DisabledEmailProvider implements EmailProvider {
  send(): Promise<void> {
    return Promise.reject(
      new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "Email delivery is not configured. Use phone sign-in or contact support.",
        503,
      ),
    );
  }
}
