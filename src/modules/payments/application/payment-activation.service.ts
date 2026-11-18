import { Injectable } from "@nestjs/common";

import { AccountTypeService } from "../../identity/index.js";
import type {
  InstallmentPlan,
  PaymentIntent,
  ServiceSubscription,
} from "../domain/payment.js";
import { PaymentRepository } from "../infrastructure/payment.repository.js";

@Injectable()
export class PaymentActivationService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly accountTypes: AccountTypeService,
  ) {}

  async activate(
    payment: PaymentIntent,
    plan: InstallmentPlan,
    now: Date,
  ): Promise<ServiceSubscription> {
    const subscription = await this.payments.activateSubscription({
      userId: payment.userId,
      payment,
      plan,
      now,
    });
    await this.accountTypes.setFindLoveProfileType(
      payment.userId,
      plan.accountType,
    );
    return subscription;
  }
}
