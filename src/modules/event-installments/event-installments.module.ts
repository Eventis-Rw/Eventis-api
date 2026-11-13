import { Module } from "@nestjs/common";

import { PaymentsModule } from "../payments/index.js";
import { PlatformModule } from "../platform/index.js";

import { AdminEventInstallmentsController } from "./api/admin-event-installments.controller.js";
import { EventInstallmentsController } from "./api/event-installments.controller.js";
import { InstallmentAgreementsService } from "./application/installment-agreements.service.js";
import { InstallmentCompletionRegistrar } from "./application/installment-completion.registrar.js";
import { InstallmentLateFeesService } from "./application/installment-late-fees.service.js";
import { InstallmentNotificationsService } from "./application/installment-notifications.service.js";
import { InstallmentOverdueService } from "./application/installment-overdue.service.js";
import { InstallmentPaymentsService } from "./application/installment-payments.service.js";
import { InstallmentPlansService } from "./application/installment-plans.service.js";
import { InstallmentPreviewService } from "./application/installment-preview.service.js";
import { InstallmentRefundsService } from "./application/installment-refunds.service.js";
import { InstallmentReportsService } from "./application/installment-reports.service.js";
import { InstallmentSchedulesService } from "./application/installment-schedules.service.js";
import { EventInstallmentRepository } from "./infrastructure/installment.repository.js";

@Module({
  // The payments module owns the provider gateway; this module never talks
  // to a payment provider directly.
  imports: [PaymentsModule, PlatformModule],
  controllers: [AdminEventInstallmentsController, EventInstallmentsController],
  providers: [
    EventInstallmentRepository,
    InstallmentPlansService,
    InstallmentPreviewService,
    InstallmentAgreementsService,
    InstallmentSchedulesService,
    InstallmentPaymentsService,
    InstallmentRefundsService,
    InstallmentLateFeesService,
    InstallmentOverdueService,
    InstallmentNotificationsService,
    InstallmentReportsService,
    InstallmentCompletionRegistrar,
  ],
  exports: [EventInstallmentRepository],
})
export class EventInstallmentsModule {}
