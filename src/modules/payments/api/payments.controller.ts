import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  Public,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { PaymentWebhookService } from "../application/payment-webhook.service.js";
import { PaymentsService } from "../application/payments.service.js";

import {
  initiatePaymentDto,
  listPaymentsDto,
  paymentWebhookDto,
  type InitiatePaymentDto,
  type ListPaymentsDto,
  type PaymentWebhookDto,
} from "./dto/payments.dto.js";

@Controller({ path: "payments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly webhooks: PaymentWebhookService,
  ) {}

  @Post()
  async initiate(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(initiatePaymentDto)) body: InitiatePaymentDto,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
  ) {
    if (!user) throw AppError.unauthenticated();
    return this.payments.initiate(
      user.userId,
      {
        accountType: body.account_type,
        installmentId: body.installment_id,
        paymentMethod: body.payment_method,
        phoneNumber: body.phone_number,
      },
      idempotencyKey,
    );
  }

  @Get(":id/status")
  async status(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    if (!user) throw AppError.unauthenticated();
    return this.payments.status(user.userId, id);
  }

  @Post("webhook")
  @Public()
  @HttpCode(200)
  async webhook(
    @Req() req: FastifyRequest,
    @Body(zodPipe(paymentWebhookDto)) body: PaymentWebhookDto,
  ) {
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      throw AppError.validation({
        signature: ["The raw request body is required to verify the webhook"],
      });
    }

    return this.webhooks.process({
      providerEventId: body.event_id,
      eventType: body.event_type ?? `payment.${body.status}`,
      paymentReference: body.payment_id,
      status: body.status,
      amountMinor:
        body.amount_minor === undefined ? undefined : BigInt(body.amount_minor),
      currency: body.currency,
      providerTransactionId: body.provider_transaction_id,
      message: body.message,
      rawBody,
      signature: headerValue(req.headers["x-payment-signature"]),
      payload: body,
    });
  }
}

@Controller({ path: "admin/payments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  async list(@Query(zodPipe(listPaymentsDto)) query: ListPaymentsDto) {
    return this.payments.listAdmin({
      page: query.page,
      limit: query.limit,
      status: query.status,
      accountType: query.account_type,
      paymentMethod: query.payment_method,
    });
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
