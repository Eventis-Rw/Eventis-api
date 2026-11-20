import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import type {
  ManualPaymentMethodPlatform,
  ManualPaymentPlatform,
} from "../domain/manual-payment.js";
import type { PaymentMethod } from "../domain/payment.js";
import { ManualPaymentRepository } from "../infrastructure/manual-payment.repository.js";

@Injectable()
export class ManualPaymentMethodsService {
  constructor(private readonly repo: ManualPaymentRepository) {}

  /** What a user picks from when paying: active methods for their platform (or scoped to BOTH), in display order. */
  async listActive(platform: ManualPaymentPlatform) {
    return this.repo.listMethods({ platform, activeOnly: true });
  }

  async listAll(platform: ManualPaymentPlatform | undefined) {
    return this.repo.listMethods({ platform, activeOnly: false });
  }

  async create(input: {
    provider: PaymentMethod;
    platform: ManualPaymentMethodPlatform;
    accountName: string | null;
    phoneNumber: string;
    instructions: string | null;
    currency: string;
    isActive: boolean;
    displayOrder: number;
  }) {
    return this.repo.createMethod(input);
  }

  async update(
    id: string,
    patch: Partial<{
      provider: PaymentMethod;
      platform: ManualPaymentMethodPlatform;
      accountName: string | null;
      phoneNumber: string;
      instructions: string | null;
      currency: string;
      isActive: boolean;
      displayOrder: number;
    }>,
  ) {
    const row = await this.repo.updateMethod(id, patch);
    if (!row) throw AppError.notFound("That payment method");
    return row;
  }

  async setActive(id: string, isActive: boolean) {
    const row = await this.repo.updateMethod(id, { isActive });
    if (!row) throw AppError.notFound("That payment method");
    return row;
  }

  async delete(id: string): Promise<void> {
    const method = await this.repo.findMethodById(id);
    if (!method) throw AppError.notFound("That payment method");
    const deleted = await this.repo.deleteMethod(id);
    if (!deleted) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This payment method was used in a submission and can't be deleted. Deactivate it instead.",
      );
    }
  }
}
