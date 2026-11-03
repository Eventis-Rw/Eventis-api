import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { AccountTypeService } from "../../identity/index.js";
import { fromApiAccountType, toApiAccountType } from "../domain/payment.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";
import {
  toAccountSubscriptionResponse,
  type AccountSubscriptionResponse,
} from "../mappers/payment.mapper.js";

@Injectable()
export class AccountSubscriptionService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly accountTypes: AccountTypeService,
    private readonly clock: Clock,
  ) {}

  async get(userId: string): Promise<AccountSubscriptionResponse> {
    const now = this.clock.now();
    const [accountType, active] = await Promise.all([
      this.accountTypes.getFindLoveProfileType(userId),
      this.payments.findActiveSubscription(userId, now),
    ]);
    return toAccountSubscriptionResponse(accountType, active, now);
  }

  async switchAccountType(
    userId: string,
    requested: "private" | "public",
  ): Promise<AccountSubscriptionResponse> {
    const now = this.clock.now();
    const [current, active] = await Promise.all([
      this.accountTypes.getFindLoveProfileType(userId),
      this.payments.findActiveSubscription(userId, now),
    ]);
    const next = fromApiAccountType(requested);

    if (active?.accountType && active.accountType !== next) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        `Your ${toApiAccountType(active.accountType)} FindLove subscription is active until ${active.expiresAt.toISOString()}. Choose an installment for the other account type to switch.`,
      );
    }

    if (current !== next) {
      await this.accountTypes.setFindLoveProfileType(userId, next);
    }

    return toAccountSubscriptionResponse(next, active, now);
  }
}
