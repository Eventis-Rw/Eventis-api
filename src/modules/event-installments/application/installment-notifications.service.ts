import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";


import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import type {
  EventInstallmentNotification,
  InstallmentNotificationStatus,
  InstallmentNotificationType,
} from "../domain/installment-payment.js";
import { EventInstallmentRepository } from "../infrastructure/installment.repository.js";

/**
 * Notification records for event installments.
 *
 * No SMS/email provider is wired for these yet — records are created as
 * PENDING and dispatched by an operator or a future integration. Nothing
 * here ever reports a send that did not happen.
 */
@Injectable()
export class InstallmentNotificationsService {
  constructor(
    private readonly installments: EventInstallmentRepository,
    private readonly clock: Clock,
  ) {}

  async create(input: {
    customerId: string;
    agreementId: string | null;
    scheduleId: string | null;
    notificationType: InstallmentNotificationType;
  }): Promise<EventInstallmentNotification> {
    return this.installments.createNotification({
      ...input,
      channels: ["SMS"],
    });
  }

  /** Operator confirms the notification was actually delivered out-of-band. */
  async markSent(id: string): Promise<void> {
    const notification = await this.installments.findNotificationById(id);
    if (!notification) throw AppError.notFound("Notification");
    if (notification.status !== "PENDING") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "This notification was already processed",
      );
    }
    await this.installments.markNotificationSent(id, true, this.clock.now());
  }

  async listForCustomer(
    userId: string,
    input: { agreementId?: string | undefined },
  ): Promise<Array<EventInstallmentNotification>> {
    const result = await this.installments.listNotifications({
      page: 1,
      limit: 100,
      customerId: userId,
      ...(input.agreementId ? { agreementId: input.agreementId } : {}),
    });
    return result.items;
  }

  async list(input: {
    page: number;
    limit: number;
    customerId?: string | undefined;
    agreementId?: string | undefined;
    statuses?: InstallmentNotificationStatus[] | undefined;
  }) {
    return this.installments.listNotifications(input);
  }
}
