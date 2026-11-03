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

import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AuthGuard, Public } from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { InstallmentPlansService } from "../application/installment-plans.service.js";
import { toInstallmentPlanResponse } from "../mappers/payment.mapper.js";

import {
  createInstallmentPlanDto,
  listInstallmentsDto,
  setInstallmentActiveDto,
  updateInstallmentPlanDto,
  type CreateInstallmentPlanDto,
  type ListInstallmentsDto,
  type SetInstallmentActiveDto,
  type UpdateInstallmentPlanDto,
} from "./dto/installments.dto.js";

const idSchema = z.uuid();

@Controller({ path: "installments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class InstallmentsController {
  constructor(private readonly plans: InstallmentPlansService) {}

  @Get()
  @Public()
  async list(@Query(zodPipe(listInstallmentsDto)) query: ListInstallmentsDto) {
    const items = await this.plans.list({
      accountType: query.account_type,
      isActive: query.active ?? true,
    });
    return { items: items.map(toInstallmentPlanResponse) };
  }
}

@Controller({ path: "admin/installments", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminInstallmentsController {
  constructor(private readonly plans: InstallmentPlansService) {}

  @Get()
  async list(@Query(zodPipe(listInstallmentsDto)) query: ListInstallmentsDto) {
    const items = await this.plans.list({
      accountType: query.account_type,
      isActive: query.active,
    });
    return { items: items.map(toInstallmentPlanResponse) };
  }

  @Post()
  async create(
    @Body(zodPipe(createInstallmentPlanDto)) body: CreateInstallmentPlanDto,
  ) {
    const plan = await this.plans.create({
      accountType: body.account_type,
      interval: body.interval,
      durationDays: body.duration_days,
      priceMinor: body.price_minor,
      isActive: body.is_active,
    });
    return toInstallmentPlanResponse(plan);
  }

  @Patch(":id")
  async update(
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(updateInstallmentPlanDto)) body: UpdateInstallmentPlanDto,
  ) {
    const plan = await this.plans.update(id, {
      interval: body.interval,
      durationDays: body.duration_days,
      priceMinor: body.price_minor,
      isActive: body.is_active,
    });
    return toInstallmentPlanResponse(plan);
  }

  @Patch(":id/status")
  async setStatus(
    @Param("id", zodPipe(idSchema)) id: string,
    @Body(zodPipe(setInstallmentActiveDto)) body: SetInstallmentActiveDto,
  ) {
    const plan = await this.plans.setActive(id, body.is_active);
    return toInstallmentPlanResponse(plan);
  }
}
