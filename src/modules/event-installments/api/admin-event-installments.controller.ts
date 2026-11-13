import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import {
  InstallmentAgreementsService,
  type AccessUser,
} from "../application/installment-agreements.service.js";
import { InstallmentLateFeesService } from "../application/installment-late-fees.service.js";
import { InstallmentNotificationsService } from "../application/installment-notifications.service.js";
import { InstallmentOverdueService } from "../application/installment-overdue.service.js";
import { InstallmentPaymentsService } from "../application/installment-payments.service.js";
import { InstallmentPlansService } from "../application/installment-plans.service.js";
import { InstallmentPreviewService } from "../application/installment-preview.service.js";
import { InstallmentRefundsService } from "../application/installment-refunds.service.js";
import { InstallmentReportsService } from "../application/installment-reports.service.js";
import { InstallmentSchedulesService } from "../application/installment-schedules.service.js";
import type { EventInstallmentNotification } from "../domain/installment-payment.js";
import {
  toInstallmentAgreementWire,
  toInstallmentLateFeeWire,
  toInstallmentPaymentWire,
  toInstallmentPlanWire,
  toInstallmentRefundWire,
  toInstallmentScheduleWire,
  toCustomerWire,
} from "../mappers/installment.mapper.js";

import {
  adjustDueDateDto,
  applyLateFeeDto,
  assignPlanDto,
  completeRefundDto,
  createCustomAgreementDto,
  createPlanDto,
  dueRemindersDto,
  listAgreementsDto,
  listAuditLogsDto,
  listLateFeesDto,
  listNotificationsDto,
  listPaymentsDto,
  listPlansDto,
  listRefundsDto,
  listSchedulesDto,
  overdueSweepDto,
  previewDto,
  recentPaymentsDto,
  rejectRefundDto,
  reportSummaryDto,
  requestRefundDto,
  reviseAgreementDto,
  setPlanStatusDto,
  recordManualPaymentDto,
  transitionAgreementDto,
  upcomingSchedulesDto,
  updatePlanDto,
  waiveLateFeeDto,
  waiveScheduleDto,
  type AdjustDueDateDto,
  type ApplyLateFeeDto,
  type AssignPlanDto,
  type CompleteRefundDto,
  type CreateCustomAgreementDto,
  type CreatePlanDto,
  type DueRemindersDto,
  type ListAgreementsDto,
  type ListLateFeesDto,
  type ListNotificationsDto,
  type ListPlansDto,
  type ListRefundsDto,
  type ListSchedulesDto,
  type OverdueSweepDto,
  type PreviewDto,
  type RecentPaymentsDto,
  type RejectRefundDto,
  type ReportSummaryDto,
  type RequestRefundDto,
  type ReviseAgreementDto,
  type SetPlanStatusDto,
  type TransitionAgreementDto,
  type UpcomingSchedulesDto,
  type UpdatePlanDto,
  type WaiveLateFeeDto,
  type WaiveScheduleDto,
  type RecordManualPaymentDto,
  type ListAuditLogsDto,
  type ListPaymentsDto,
} from "./dto/event-installments.dto.js";

function actorFrom(user: AuthenticatedUser | undefined): AccessUser {
  if (!user) throw AppError.unauthenticated();
  return { userId: user.userId, role: user.role, roles: user.roles };
}

@Controller({ path: "admin/event-installments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminEventInstallmentsController {
  constructor(
    private readonly plans: InstallmentPlansService,
    private readonly previewService: InstallmentPreviewService,
    private readonly agreements: InstallmentAgreementsService,
    private readonly schedules: InstallmentSchedulesService,
    private readonly payments: InstallmentPaymentsService,
    private readonly refunds: InstallmentRefundsService,
    private readonly lateFees: InstallmentLateFeesService,
    private readonly overdue: InstallmentOverdueService,
    private readonly notifications: InstallmentNotificationsService,
    private readonly reports: InstallmentReportsService,
  ) {}


  @Get("plans")
  async listPlans(@Query(zodPipe(listPlansDto)) query: ListPlansDto) {
    const items = await this.plans.list({
      isActive:
        query.is_active === undefined
          ? undefined
          : query.is_active === "true",
    });
    return { plans: items.map(toInstallmentPlanWire) };
  }

  @Post("plans")
  async createPlan(@Body(zodPipe(createPlanDto)) body: CreatePlanDto) {
    return {
      plan: toInstallmentPlanWire(
        await this.plans.create({
          name: body.name,
          description: body.description,
          frequency: body.frequency.toUpperCase() as "WEEKLY" | "MONTHLY" | "YEARLY",
          intervalCount: body.interval_count,
          installmentCount: body.installment_count,
          initialPaymentType: body.initial_payment_type.toUpperCase() as "FIXED" | "PERCENT",
          initialPaymentValue: BigInt(body.initial_payment_value),
          interestRateBps: body.interest_rate_bps,
          lateFeeType: body.late_fee_type.toUpperCase() as "FIXED" | "PERCENT",
          lateFeeValue: BigInt(body.late_fee_value),
          gracePeriodDays: body.grace_period_days,
          allowPartialPayment: body.allow_partial_payment,
          allowEarlyPayment: body.allow_early_payment,
          currency: body.currency,
          isActive: body.is_active,
        }),
      ),
    };
  }

  @Get("plans/:id")
  async getPlan(@Param("id") id: string) {
    return { plan: toInstallmentPlanWire(await this.plans.find(id)) };
  }

  @Patch("plans/:id")
  async updatePlan(
    @Param("id") id: string,
    @Body(zodPipe(updatePlanDto)) body: UpdatePlanDto,
  ) {
    return {
      plan: toInstallmentPlanWire(
        await this.plans.update(id, {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined
            ? { description: body.description }
            : {}),
          ...(body.frequency !== undefined
            ? {
                frequency: body.frequency.toUpperCase() as
                  | "WEEKLY"
                  | "MONTHLY"
                  | "YEARLY",
              }
            : {}),
          ...(body.interval_count !== undefined
            ? { intervalCount: body.interval_count }
            : {}),
          ...(body.installment_count !== undefined
            ? { installmentCount: body.installment_count }
            : {}),
          ...(body.initial_payment_type !== undefined
            ? {
                initialPaymentType: body.initial_payment_type.toUpperCase() as
                  | "FIXED"
                  | "PERCENT",
              }
            : {}),
          ...(body.initial_payment_value !== undefined
            ? { initialPaymentValue: BigInt(body.initial_payment_value) }
            : {}),
          ...(body.interest_rate_bps !== undefined
            ? { interestRateBps: body.interest_rate_bps }
            : {}),
          ...(body.late_fee_type !== undefined
            ? {
                lateFeeType: body.late_fee_type.toUpperCase() as
                  | "FIXED"
                  | "PERCENT",
              }
            : {}),
          ...(body.late_fee_value !== undefined
            ? { lateFeeValue: BigInt(body.late_fee_value) }
            : {}),
          ...(body.grace_period_days !== undefined
            ? { gracePeriodDays: body.grace_period_days }
            : {}),
          ...(body.allow_partial_payment !== undefined
            ? { allowPartialPayment: body.allow_partial_payment }
            : {}),
          ...(body.allow_early_payment !== undefined
            ? { allowEarlyPayment: body.allow_early_payment }
            : {}),
          ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
        }),
      ),
    };
  }

  @Post("plans/:id/status")
  async setPlanStatus(
    @Param("id") id: string,
    @Body(zodPipe(setPlanStatusDto)) body: SetPlanStatusDto,
  ) {
    return {
      plan: toInstallmentPlanWire(await this.plans.setActive(id, body.is_active)),
    };
  }


  @Post("preview")
  async preview(@Body(zodPipe(previewDto)) body: PreviewDto) {
    const result = await this.previewService.preview({
      planId: body.plan_id,
      totalAmountMinor: BigInt(body.total_amount_minor),
      currency: body.currency,
      startDate: body.start_date,
    });
    return {
      terms: {
        total_amount_minor: result.terms.totalAmountMinor.toString(10),
        initial_payment_minor: result.terms.initialPaymentMinor.toString(10),
        financed_amount_minor: result.terms.financedAmountMinor.toString(10),
        interest_amount_minor: result.terms.interestAmountMinor.toString(10),
        total_payable_minor: result.terms.totalPayableMinor.toString(10),
      },
      installments: result.installments.map((row) => ({
        installment_number: row.installmentNumber,
        is_initial_payment: row.isInitialPayment,
        due_date: row.dueDate.toISOString(),
        principal_amount_minor: row.principalAmountMinor.toString(10),
        interest_amount_minor: row.interestAmountMinor.toString(10),
        amount_due_minor: row.amountDueMinor.toString(10),
      })),
    };
  }


  @Post("agreements")
  async assignPlan(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(assignPlanDto)) body: AssignPlanDto,
  ) {
    return {
      agreement: toInstallmentAgreementWire(
        await this.agreements.assign(actorFrom(user), {
          customerId: body.customer_id,
          eventId: body.event_id,
          planId: body.plan_id,
          totalAmountMinor: BigInt(body.total_amount_minor),
          startDate: body.start_date,
          status: body.status.toUpperCase() as "DRAFT" | "ACTIVE",
        }),
      ),
    };
  }

  @Post("agreements/custom")
  async createCustom(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(createCustomAgreementDto)) body: CreateCustomAgreementDto,
  ) {
    return {
      agreement: toInstallmentAgreementWire(
        await this.agreements.createCustom(actorFrom(user), {
          customerId: body.customer_id,
          eventId: body.event_id,
          totalAmountMinor: BigInt(body.total_amount_minor),
          initialPaymentMinor: BigInt(body.initial_payment_minor),
          interestRateBps: body.interest_rate_bps,
          frequency: body.frequency.toUpperCase() as "WEEKLY" | "MONTHLY" | "YEARLY",
          intervalCount: body.interval_count,
          installmentCount: body.installment_count,
          startDate: body.start_date,
          gracePeriodDays: body.grace_period_days,
          lateFeeType: body.late_fee_type.toUpperCase() as "FIXED" | "PERCENT",
          lateFeeValue: BigInt(body.late_fee_value),
          allowPartialPayment: body.allow_partial_payment,
          allowEarlyPayment: body.allow_early_payment,
          status: body.status.toUpperCase() as "DRAFT" | "ACTIVE",
        }),
      ),
    };
  }

  @Get("agreements")
  async listAgreements(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(listAgreementsDto)) query: ListAgreementsDto,
  ) {
    const result = await this.agreements.list(actorFrom(user), {
      page: query.page,
      limit: query.limit,
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.event_id ? { eventId: query.event_id } : {}),
      ...(query.status
        ? { statuses: [query.status.toUpperCase() as never] }
        : {}),
      ...(query.created_from ? { createdFrom: query.created_from } : {}),
      ...(query.created_to ? { createdTo: query.created_to } : {}),
    });
    return {
      agreements: result.items.map(toInstallmentAgreementWire),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get("agreements/:id")
  async getAgreement(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    return {
      agreement: toInstallmentAgreementWire(
        await this.agreements.get(actorFrom(user), id),
      ),
    };
  }

  @Post("agreements/:id/revise")
  async reviseAgreement(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(reviseAgreementDto)) body: ReviseAgreementDto,
  ) {
    return {
      agreement: toInstallmentAgreementWire(
        await this.agreements.revise(actorFrom(user), id, {
          frequency: body.frequency.toUpperCase() as "WEEKLY" | "MONTHLY" | "YEARLY",
          intervalCount: body.interval_count,
          installmentCount: body.installment_count,
          startDate: body.start_date,
          allowPartialPayment: body.allow_partial_payment,
          allowEarlyPayment: body.allow_early_payment,
          reason: body.reason,
        }),
      ),
    };
  }

  @Post("agreements/:id/status")
  async transitionAgreement(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(transitionAgreementDto)) body: TransitionAgreementDto,
  ) {
    return {
      agreement: toInstallmentAgreementWire(
        await this.agreements.transitionStatus(
          actorFrom(user),
          id,
          body.status.toUpperCase() as never,
          body.reason,
        ),
      ),
    };
  }

  @Get("agreements/:id/schedules")
  async listSchedules(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Query(zodPipe(listSchedulesDto)) query: ListSchedulesDto,
  ) {
    const result = await this.schedules.list(actorFrom(user), {
      agreementId: id,
      page: query.page,
      limit: query.limit,
      ...(query.status
        ? { statuses: [query.status.toUpperCase() as never] }
        : {}),
    });
    return {
      schedules: result.items.map(toInstallmentScheduleWire),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }


  @Post("schedules/:id/due-date")
  async adjustDueDate(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(adjustDueDateDto)) body: AdjustDueDateDto,
  ) {
    return {
      schedule: toInstallmentScheduleWire(
        await this.schedules.adjustDueDate(
          actorFrom(user),
          id,
          body.due_date,
          body.reason,
        ),
      ),
    };
  }

  @Post("schedules/:id/waive")
  async waiveSchedule(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(waiveScheduleDto)) body: WaiveScheduleDto,
  ) {
    return {
      schedule: toInstallmentScheduleWire(
        await this.schedules.waive(actorFrom(user), id, body.reason),
      ),
    };
  }


  @Post("payments/manual")
  async recordManualPayment(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(recordManualPaymentDto)) body: RecordManualPaymentDto,
  ) {
    const actor = actorFrom(user);
    return {
      payment: toInstallmentPaymentWire(
        await this.payments.recordManualPayment(actor, {
          agreementId: body.agreement_id,
          scheduleId: body.schedule_id,
          amountMinor: BigInt(body.amount_minor),
          transactionReference: body.transaction_reference,
          reason: body.reason,
        }),
      ),
    };
  }

  @Get("payments")
  async listPayments(@Query(zodPipe(listPaymentsDto)) query: ListPaymentsDto) {
    const result = await this.payments.listAdmin({
      page: query.page,
      limit: query.limit,
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.agreement_id ? { agreementId: query.agreement_id } : {}),
      ...(query.event_id ? { eventId: query.event_id } : {}),
      ...(query.status
        ? { statuses: [query.status.toUpperCase() as never] }
        : {}),
    });
    return {
      payments: result.items.map(toInstallmentPaymentWire),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get("payments/:id")
  async getPayment(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    return {
      payment: toInstallmentPaymentWire(
        await this.payments.get(actorFrom(user), id),
      ),
    };
  }


  @Post("refunds")
  async requestRefund(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(requestRefundDto)) body: RequestRefundDto,
  ) {
    const actor = actorFrom(user);
    return {
      refund: toInstallmentRefundWire(
        await this.refunds.request(actor, {
          installmentPaymentId: body.installment_payment_id,
          amountMinor: BigInt(body.amount_minor),
          reason: body.reason,
        }),
      ),
    };
  }

  @Get("refunds")
  async listRefunds(@Query(zodPipe(listRefundsDto)) query: ListRefundsDto) {
    const result = await this.refunds.list({
      page: query.page,
      limit: query.limit,
      ...(query.status
        ? { statuses: [query.status.toUpperCase() as never] }
        : {}),
    });
    return {
      refunds: result.items.map(toInstallmentRefundWire),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Get("refunds/:id")
  async getRefund(@Param("id") id: string) {
    return { refund: toInstallmentRefundWire(await this.refunds.get(id)) };
  }

  @Post("refunds/:id/complete")
  async completeRefund(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(completeRefundDto)) body: CompleteRefundDto,
  ) {
    const actor = actorFrom(user);
    return {
      refund: toInstallmentRefundWire(
        await this.refunds.complete({
          refundId: id,
          processedBy: actor.userId,
          providerRefundReference: body.provider_refund_reference,
        }),
      ),
    };
  }

  @Post("refunds/:id/reject")
  async rejectRefund(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(rejectRefundDto)) body: RejectRefundDto,
  ) {
    const actor = actorFrom(user);
    return {
      refund: toInstallmentRefundWire(
        await this.refunds.reject(actor, id, body.reason),
      ),
    };
  }


  @Post("late-fees")
  async applyLateFee(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(applyLateFeeDto)) body: ApplyLateFeeDto,
  ) {
    const actor = actorFrom(user);
    const result = await this.lateFees.apply(actor, {
      scheduleId: body.schedule_id,
      amountMinor: BigInt(body.amount_minor),
      reason: body.reason,
    });
    return {
      late_fee: toInstallmentLateFeeWire(result.lateFee),
      already_applied: result.alreadyApplied,
    };
  }

  @Post("late-fees/:id/waive")
  async waiveLateFee(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Body(zodPipe(waiveLateFeeDto)) body: WaiveLateFeeDto,
  ) {
    const actor = actorFrom(user);
    return {
      late_fee: toInstallmentLateFeeWire(
        await this.lateFees.waive(actor, id, body.reason),
      ),
    };
  }

  @Get("late-fees")
  async listLateFees(@Query(zodPipe(listLateFeesDto)) query: ListLateFeesDto) {
    const result = await this.lateFees.list({
      page: query.page,
      limit: query.limit,
      ...(query.agreement_id ? { agreementId: query.agreement_id } : {}),
      ...(query.schedule_id ? { scheduleId: query.schedule_id } : {}),
    });
    return {
      late_fees: result.items.map(toInstallmentLateFeeWire),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }


  @Post("overdue-sweep")
  @HttpCode(200)
  async overdueSweep(@Body(zodPipe(overdueSweepDto)) body: OverdueSweepDto) {
    return this.overdue.sweep({ applyLateFees: body.apply_late_fees });
  }

  @Post("notifications/reminders")
  @HttpCode(200)
  async dueReminders(@Body(zodPipe(dueRemindersDto)) body: DueRemindersDto) {
    const created = await this.schedules.dueReminders({
      from: body.from,
      to: body.to,
      limit: body.limit,
    });
    return { notifications_created: created };
  }


  @Get("notifications")
  async listNotifications(
    @Query(zodPipe(listNotificationsDto)) query: ListNotificationsDto,
  ) {
    const result = await this.notifications.list({
      page: query.page,
      limit: query.limit,
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.agreement_id ? { agreementId: query.agreement_id } : {}),
      ...(query.status
        ? { statuses: [query.status.toUpperCase() as never] }
        : {}),
    });
    return {
      notifications: result.items.map((row) => ({
        id: row.id,
        customer_id: row.customerId,
        agreement_id: row.agreementId,
        schedule_id: row.scheduleId,
        notification_type: row.notificationType.toLowerCase(),
        channels: row.channels.map((channel) => channel.toLowerCase()),
        status: row.status.toLowerCase(),
        sent_at: row.sentAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        customer: toCustomerWire(row.customer),
      })),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }

  @Post("notifications/:id/sent")
  async markNotificationSent(@Param("id") id: string) {
    await this.notifications.markSent(id);
    return { success: true as const };
  }


  @Get("reports/summary")
  async reportSummary(@Query(zodPipe(reportSummaryDto)) query: ReportSummaryDto) {
    const summary = await this.reports.summary({
      ...(query.created_from ? { createdFrom: query.created_from } : {}),
      ...(query.created_to ? { createdTo: query.created_to } : {}),
    });
    return {
      total_agreements: summary.totalAgreements,
      by_status: summary.byStatus,
      total_expected_minor: summary.totalExpectedMinor.toString(10),
      total_collected_minor: summary.totalCollectedMinor.toString(10),
      total_refunded_minor: summary.totalRefundedMinor.toString(10),
      total_outstanding_minor: summary.totalOutstandingMinor.toString(10),
      total_late_fees_minor: summary.totalLateFeesMinor.toString(10),
      overdue_balance_minor: summary.overdueBalanceMinor.toString(10),
    };
  }

  @Get("reports/recent-payments")
  async recentPayments(@Query(zodPipe(recentPaymentsDto)) query: RecentPaymentsDto) {
    const payments = await this.reports.recentPayments({
      limit: query.limit,
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
      ...(query.event_id ? { eventId: query.event_id } : {}),
    });
    return { payments: payments.map(toInstallmentPaymentWire) };
  }

  @Get("reports/upcoming-schedules")
  async upcomingSchedules(
    @Query(zodPipe(upcomingSchedulesDto)) query: UpcomingSchedulesDto,
  ) {
    const schedules = await this.reports.upcomingSchedules({
      from: query.from,
      to: query.to,
      limit: query.limit,
      ...(query.customer_id ? { customerId: query.customer_id } : {}),
    });
    return {
      schedules: schedules.map((row) => ({
        agreement_id: row.agreementId,
        customer_id: row.customerId,
        schedule_id: row.scheduleId,
        installment_number: row.installmentNumber,
        due_date: row.dueDate.toISOString(),
        amount_due_minor: row.amountDueMinor.toString(10),
        outstanding_amount_minor: row.outstandingAmountMinor.toString(10),
        status: row.status.toLowerCase(),
      })),
    };
  }

  @Get("audit-logs")
  async auditLogs(@Query(zodPipe(listAuditLogsDto)) query: ListAuditLogsDto) {
    const result = await this.reports.auditLogs({
      page: query.page,
      limit: query.limit,
      ...(query.entity_id ? { entityId: query.entity_id } : {}),
      ...(query.entity_type ? { entityType: query.entity_type } : {}),
      ...(query.actor_id ? { actorId: query.actor_id } : {}),
    });
    return {
      audit_logs: result.items.map((row) => ({
        id: row.id,
        actor_id: row.actorId,
        action: row.action,
        entity_type: row.entityType,
        entity_id: row.entityId,
        previous_values: row.previousValues,
        new_values: row.newValues,
        reason: row.reason,
        created_at: row.createdAt.toISOString(),
        actor: row.actor ? toCustomerWire(row.actor) : null,
      })),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }
}

export type { EventInstallmentNotification };
