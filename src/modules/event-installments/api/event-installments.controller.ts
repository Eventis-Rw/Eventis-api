import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { InstallmentAgreementsService } from "../application/installment-agreements.service.js";
import { InstallmentNotificationsService } from "../application/installment-notifications.service.js";
import { InstallmentPaymentsService } from "../application/installment-payments.service.js";
import { InstallmentSchedulesService } from "../application/installment-schedules.service.js";
import {
  toInstallmentAgreementWire,
  toInstallmentPaymentWire,
  toInstallmentScheduleWire,
  toPaymentIntentWire,
} from "../mappers/installment.mapper.js";

import {
  initiatePaymentDto,
  listMyAgreementsDto,
  listMyNotificationsDto,
  listMyPaymentsDto,
  listSchedulesDto,
  type InitiatePaymentDto,
  type ListMyAgreementsDto,
  type ListMyNotificationsDto,
  type ListMyPaymentsDto,
  type ListSchedulesDto,
} from "./dto/event-installments.dto.js";

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}

@Controller({ path: "event-installments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class EventInstallmentsController {
  constructor(
    private readonly agreements: InstallmentAgreementsService,
    private readonly schedules: InstallmentSchedulesService,
    private readonly payments: InstallmentPaymentsService,
    private readonly notifications: InstallmentNotificationsService,
  ) {}

  @Get("agreements")
  async myAgreements(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(listMyAgreementsDto)) query: ListMyAgreementsDto,
  ) {
    const me = requireUser(user);
    const items = await this.agreements.listForCustomer(me.userId, {
      ...(query.event_id ? { eventId: query.event_id } : {}),
    });
    return { agreements: items.map(toInstallmentAgreementWire) };
  }

  @Get("agreements/:id")
  async getAgreement(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    const me = requireUser(user);
    return {
      agreement: toInstallmentAgreementWire(
        await this.agreements.getForCustomer(me.userId, id),
      ),
    };
  }

  @Get("agreements/:id/schedules")
  async agreementSchedules(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
    @Query(zodPipe(listSchedulesDto)) query: ListSchedulesDto,
  ) {
    const me = requireUser(user);
    // Ownership is checked inside; customers read only their own schedules.
    const agreement = await this.agreements.getForCustomer(me.userId, id);
    const result = await this.schedules.list(
      { userId: me.userId, role: me.role, roles: me.roles },
      {
        agreementId: agreement.id,
        page: query.page,
        limit: query.limit,
        ...(query.status
          ? { statuses: [query.status.toUpperCase() as never] }
          : {}),
      },
    );
    return {
      schedules: result.items.map(toInstallmentScheduleWire),
      total: result.total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * Starts a mobile money collection for one installment of the caller's
   * agreement. The provider is reached only through the payments module.
   */
  @Post("agreements/:id/schedules/:scheduleId/payments")
  async initiatePayment(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Param("id") agreementId: string,
    @Param("scheduleId") scheduleId: string,
    @Body(zodPipe(initiatePaymentDto)) body: InitiatePaymentDto,
  ) {
    const me = requireUser(user);
    const result = await this.payments.initiate(
      {
        userId: me.userId,
        agreementId,
        scheduleId,
        amountMinor: BigInt(body.amount_minor),
        paymentMethod: body.payment_method.toUpperCase() as
          | "MTN_MOMO"
          | "AIRTEL_MONEY",
        phoneNumber: body.phone_number,
      },
      idempotencyKey,
    );
    return {
      installment_payment: toInstallmentPaymentWire(result.installmentPayment),
      payment_intent: result.paymentIntent
        ? toPaymentIntentWire(result.paymentIntent)
        : null,
      message: result.message,
    };
  }

  @Get("payments")
  async myPayments(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(listMyPaymentsDto)) query: ListMyPaymentsDto,
  ) {
    const me = requireUser(user);
    const items = await this.payments.listForCustomer(me.userId, {
      ...(query.agreement_id ? { agreementId: query.agreement_id } : {}),
    });
    return { payments: items.map(toInstallmentPaymentWire) };
  }

  /** Reconciles the payment with the provider and mirrors the result. */
  @Get("payments/:id/status")
  async paymentStatus(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    const me = requireUser(user);
    const result = await this.payments.checkStatus(me.userId, id);
    return {
      installment_payment: toInstallmentPaymentWire(result.installmentPayment),
      message: result.message,
    };
  }

  @Get("notifications")
  async myNotifications(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(listMyNotificationsDto)) query: ListMyNotificationsDto,
  ) {
    const me = requireUser(user);
    const items = await this.notifications.listForCustomer(me.userId, {
      ...(query.agreement_id ? { agreementId: query.agreement_id } : {}),
    });
    return {
      notifications: items.map((row) => ({
        id: row.id,
        agreement_id: row.agreementId,
        schedule_id: row.scheduleId,
        notification_type: row.notificationType.toLowerCase(),
        channels: row.channels.map((channel) => channel.toLowerCase()),
        status: row.status.toLowerCase(),
        sent_at: row.sentAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }
}
