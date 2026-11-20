import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { Roles } from "../../../common/decorators/roles.decorator.js";
import { AuthGuard } from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { ManualPaymentMethodsService } from "../application/manual-payment-methods.service.js";
import {
  createManualPaymentMethodDto,
  listManualPaymentMethodsDto,
  setManualPaymentMethodActiveDto,
  updateManualPaymentMethodDto,
  type CreateManualPaymentMethodDto,
  type ListManualPaymentMethodsDto,
  type SetManualPaymentMethodActiveDto,
  type UpdateManualPaymentMethodDto,
} from "./dto/manual-payments.dto.js";
import {
  fromApiMethodPlatform,
  fromApiPlatform,
  toManualPaymentMethodResponse,
} from "../mappers/manual-payment.mapper.js";
import { fromApiPaymentMethod } from "../domain/payment.js";

const idParam = z.object({ id: z.uuid() });

@Controller({ path: "admin/manual-payment-methods", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
@Roles("admin")
export class AdminManualPaymentMethodsController {
  constructor(private readonly methods: ManualPaymentMethodsService) {}

  @Get()
  async list(
    @Query(zodPipe(listManualPaymentMethodsDto)) query: ListManualPaymentMethodsDto,
  ) {
    const items = await this.methods.listAll(
      query.platform ? fromApiPlatform(query.platform) : undefined,
    );
    return { items: items.map(toManualPaymentMethodResponse) };
  }

  @Post()
  async create(
    @Body(zodPipe(createManualPaymentMethodDto)) body: CreateManualPaymentMethodDto,
  ) {
    const row = await this.methods.create({
      provider: fromApiPaymentMethod(body.provider),
      platform: fromApiMethodPlatform(body.platform),
      accountName: body.account_name ?? null,
      phoneNumber: body.phone_number,
      instructions: body.instructions ?? null,
      currency: body.currency,
      isActive: body.is_active,
      displayOrder: body.display_order,
    });
    return toManualPaymentMethodResponse(row);
  }

  @Patch(":id")
  async update(
    @Param(zodPipe(idParam)) params: z.infer<typeof idParam>,
    @Body(zodPipe(updateManualPaymentMethodDto)) body: UpdateManualPaymentMethodDto,
  ) {
    const row = await this.methods.update(params.id, {
      ...(body.provider ? { provider: fromApiPaymentMethod(body.provider) } : {}),
      ...(body.platform ? { platform: fromApiMethodPlatform(body.platform) } : {}),
      ...(body.account_name !== undefined ? { accountName: body.account_name } : {}),
      ...(body.phone_number !== undefined ? { phoneNumber: body.phone_number } : {}),
      ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
      ...(body.currency !== undefined ? { currency: body.currency } : {}),
      ...(body.is_active !== undefined ? { isActive: body.is_active } : {}),
      ...(body.display_order !== undefined ? { displayOrder: body.display_order } : {}),
    });
    return toManualPaymentMethodResponse(row);
  }

  @Patch(":id/status")
  async setStatus(
    @Param(zodPipe(idParam)) params: z.infer<typeof idParam>,
    @Body(zodPipe(setManualPaymentMethodActiveDto)) body: SetManualPaymentMethodActiveDto,
  ) {
    const row = await this.methods.setActive(params.id, body.is_active);
    return toManualPaymentMethodResponse(row);
  }

  @Delete(":id")
  async remove(@Param(zodPipe(idParam)) params: z.infer<typeof idParam>) {
    await this.methods.delete(params.id);
    return { ok: true };
  }
}
