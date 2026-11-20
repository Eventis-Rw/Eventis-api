import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import { AuthGuard, type AuthenticatedUser } from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { ManualPaymentMethodsService } from "../application/manual-payment-methods.service.js";
import { ManualPaymentsService } from "../application/manual-payments.service.js";
import {
  listManualPaymentMethodsDto,
  listManualPaymentsAdminDto,
  listMyManualPaymentsDto,
  rejectManualPaymentDto,
  submitManualPaymentDto,
  type ListManualPaymentMethodsDto,
  type ListManualPaymentsAdminDto,
  type ListMyManualPaymentsDto,
  type RejectManualPaymentDto,
  type SubmitManualPaymentDto,
} from "./dto/manual-payments.dto.js";
import {
  fromApiPlatform,
  fromApiStatus,
  toManualPaymentAdminResponse,
  toManualPaymentMethodResponse,
  toManualPaymentSubmissionResponse,
} from "../mappers/manual-payment.mapper.js";

const idParam = z.object({ id: z.uuid() });

function requireUser(user: AuthenticatedUser | undefined): AuthenticatedUser {
  if (!user) throw AppError.unauthenticated();
  return user;
}

@Controller({ path: "manual-payments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class ManualPaymentsController {
  constructor(
    private readonly methods: ManualPaymentMethodsService,
    private readonly payments: ManualPaymentsService,
  ) {}

  /** Active payment numbers for the platform the member is paying for. */
  @Get("methods")
  async listMethods(
    @Query(zodPipe(listManualPaymentMethodsDto)) query: ListManualPaymentMethodsDto,
  ) {
    if (!query.platform) {
      throw AppError.validation({ platform: ["platform is required"] });
    }
    const items = await this.methods.listActive(fromApiPlatform(query.platform));
    return { items: items.map(toManualPaymentMethodResponse) };
  }

  @Post()
  async submit(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(submitManualPaymentDto)) body: SubmitManualPaymentDto,
  ) {
    const actor = requireUser(user);
    const row = await this.payments.submit(actor.userId, {
      platform: fromApiPlatform(body.platform),
      installmentPlanId: body.installment_plan_id,
      organiserPlanId: body.organiser_plan_id,
      paymentMethodId: body.payment_method_id,
      receiptUploadId: body.receipt_upload_id,
    });
    return toManualPaymentSubmissionResponse(row);
  }

  @Get("mine")
  async listMine(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query(zodPipe(listMyManualPaymentsDto)) query: ListMyManualPaymentsDto,
  ) {
    const actor = requireUser(user);
    const { items, total } = await this.payments.listMine(actor.userId, {
      platform: query.platform ? fromApiPlatform(query.platform) : undefined,
      status: query.status ? fromApiStatus(query.status) : undefined,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: items.map(toManualPaymentSubmissionResponse),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  @Get(":id")
  async getMine(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParam)) params: z.infer<typeof idParam>,
  ) {
    const actor = requireUser(user);
    const row = await this.payments.getMine(actor.userId, params.id);
    return toManualPaymentSubmissionResponse(row);
  }
}

@Controller({ path: "admin/manual-payments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminManualPaymentsController {
  constructor(private readonly payments: ManualPaymentsService) {}

  @Get()
  async list(
    @Query(zodPipe(listManualPaymentsAdminDto)) query: ListManualPaymentsAdminDto,
  ) {
    const { items, total } = await this.payments.listForAdmin({
      platform: query.platform ? fromApiPlatform(query.platform) : undefined,
      status: query.status ? fromApiStatus(query.status) : undefined,
      paymentMethodId: query.payment_method_id,
      from: query.from,
      to: query.to,
      q: query.q,
      page: query.page,
      limit: query.limit,
    });
    return {
      items: items.map(toManualPaymentAdminResponse),
      page: query.page,
      limit: query.limit,
      total,
    };
  }

  @Get(":id")
  async getOne(@Param(zodPipe(idParam)) params: z.infer<typeof idParam>) {
    const row = await this.payments.getForAdmin(params.id);
    return toManualPaymentAdminResponse(row);
  }

  @Patch(":id/review")
  async markUnderReview(@Param(zodPipe(idParam)) params: z.infer<typeof idParam>) {
    const row = await this.payments.markUnderReview(params.id);
    return toManualPaymentSubmissionResponse(row);
  }

  @Post(":id/approve")
  async approve(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParam)) params: z.infer<typeof idParam>,
  ) {
    const actor = requireUser(user);
    const row = await this.payments.approve(actor.userId, params.id);
    return toManualPaymentSubmissionResponse(row);
  }

  @Post(":id/reject")
  async reject(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param(zodPipe(idParam)) params: z.infer<typeof idParam>,
    @Body(zodPipe(rejectManualPaymentDto)) body: RejectManualPaymentDto,
  ) {
    const actor = requireUser(user);
    const row = await this.payments.reject(actor.userId, params.id, body.rejection_reason);
    return toManualPaymentSubmissionResponse(row);
  }
}
