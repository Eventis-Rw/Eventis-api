import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../../../common/decorators/current-user.decorator.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  AuthGuard,
  Public,
  type AuthenticatedUser,
} from "../../../common/guards/auth.guard.js";
import { RolesGuard } from "../../../common/guards/roles.guard.js";
import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { AccountSubscriptionService } from "../application/account-subscription.service.js";

import {
  updateAccountTypeDto,
  type UpdateAccountTypeDto,
} from "./dto/payments.dto.js";

const ACCOUNT_TYPES = [
  {
    code: "private",
    name: "Private Account",
    description: "Only compatible members can see and contact you.",
    profile_type: "PRIVATE",
  },
  {
    code: "public",
    name: "Public Account",
    description:
      "Your FindLove profile can be discovered by compatible members.",
    profile_type: "PUBLIC",
  },
] as const;

@Controller({ path: "findlove", version: "1" })
@UseGuards(AuthGuard, RolesGuard)
export class FindLoveAccountController {
  constructor(private readonly subscription: AccountSubscriptionService) {}

  @Get("account-types")
  @Public()
  accountTypes() {
    return { items: ACCOUNT_TYPES };
  }

  @Get("subscription")
  async getSubscription(@CurrentUser() user: AuthenticatedUser | undefined) {
    if (!user) throw AppError.unauthenticated();
    return this.subscription.get(user.userId);
  }

  @Patch("account-type")
  async updateAccountType(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Body(zodPipe(updateAccountTypeDto)) body: UpdateAccountTypeDto,
  ) {
    if (!user) throw AppError.unauthenticated();
    return this.subscription.switchAccountType(user.userId, body.account_type);
  }
}
