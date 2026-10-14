import { Module } from "@nestjs/common";

import { ENV, type Env } from "../../config/env.js";
import { StorageModule } from "../../infrastructure/storage/storage.module.js";
import { PlatformModule } from "../platform/index.js";

import { AuthController } from "./api/auth.controller.js";
import { AdminUsersController } from "./api/admin-users.controller.js";
import { JwtAuthGuard } from "./api/jwt-auth.guard.js";
import { UsersController } from "./api/users.controller.js";
import { GetMeService } from "./application/get-me.service.js";
import { LoginService } from "./application/login.service.js";
import { LogoutService } from "./application/logout.service.js";
import { RefreshTokenService } from "./application/refresh-token.service.js";
import { RequestOtpService } from "./application/request-otp.service.js";
import { UpdateProfileService } from "./application/update-profile.service.js";
import { VerifyAccessTokenService } from "./application/verify-access-token.service.js";
import { VerifyOtpService } from "./application/verify-otp.service.js";
import {
  OtpRepository,
  RefreshSessionRepository,
  UserRepository,
} from "./infrastructure/identity.repository.js";
import { AfricasTalkingSmsProvider } from "./infrastructure/sms/africas-talking.provider.js";
import { FakeSmsProvider } from "./infrastructure/sms/fake-sms.provider.js";
import { SMS_PROVIDER } from "./infrastructure/sms/sms-provider.js";
import { TokenService } from "./infrastructure/token.service.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";

@Module({
  imports: [PlatformModule, StorageModule],
  controllers: [AuthController, UsersController, AdminUsersController],
  providers: [
    RequestOtpService,
    VerifyOtpService,
    RefreshTokenService,
    LogoutService,
    GetMeService,
    LoginService,
    UpdateProfileService,
    VerifyAccessTokenService,
    OtpRepository,
    UserRepository,
    RefreshSessionRepository,
    TokenService,
    JwtAuthGuard,
    RolesGuard,
    FakeSmsProvider,
    AfricasTalkingSmsProvider,
    {
      provide: SMS_PROVIDER,
      inject: [ENV, FakeSmsProvider, AfricasTalkingSmsProvider],
      useFactory: (
        env: Env,
        fake: FakeSmsProvider,
        at: AfricasTalkingSmsProvider,
      ) => (env.SMS_PROVIDER === "africas_talking" ? at : fake),
    },
  ],
  exports: [
    RequestOtpService,
    VerifyOtpService,
    RefreshTokenService,
    LogoutService,
    GetMeService,
    TokenService,
    JwtAuthGuard,
    FakeSmsProvider,
  ],
})
export class IdentityModule {}
