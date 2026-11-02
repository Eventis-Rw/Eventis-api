import {
  logoutRequest,
  refreshRequest,
  type AuthSession,
  type AuthTokens,
  type LogoutRequest,
  type OtpRequestResponse,
  type RefreshRequest,
  type SessionUser,
} from "@eventis/contracts";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";

import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { GetMeService } from "../application/get-me.service.js";
import { LoginService } from "../application/login.service.js";
import { LogoutService } from "../application/logout.service.js";
import { RefreshTokenService } from "../application/refresh-token.service.js";
import { RequestOtpService } from "../application/request-otp.service.js";
import { VerifyOtpService } from "../application/verify-otp.service.js";

import { CurrentUserId, JwtAuthGuard } from "./jwt-auth.guard.js";

const phone = z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number");
const otpCode = z.string().regex(/^\d{6}$/, "OTP must contain exactly 6 digits");
const pin = z.string().regex(/^\d{5}$/, "PIN must contain exactly 5 digits");
const verifyOtpRequest = z.object({ phone, code: otpCode, pin });
const verifySignupRequest = z.object({ phone, code: otpCode });
const signupRequest = z.object({
  phone,
  username: z.string().trim().min(2).max(100).optional(),
  firstName: z.string().trim().min(2).max(100).optional(),
  accountType: z.enum(["POSTER", "CUSTOMER"]).default("CUSTOMER"),
  pin,
}).refine((value) => Boolean(value.username ?? value.firstName), {
  message: "username is required",
  path: ["username"],
}).transform(({ username, firstName, ...value }) => ({
  ...value,
  firstName: username ?? firstName!,
}));
const loginRequest = z.object({
  phone,
  pin,
});
const resetPinRequest = z.object({
  phone,
});
const resetPinVerifyRequest = z.object({ phone, code: otpCode, pin });

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(
    private readonly requestOtp: RequestOtpService,
    private readonly verifyOtp: VerifyOtpService,
    private readonly refreshToken: RefreshTokenService,
    private readonly logout: LogoutService,
    private readonly getMe: GetMeService,
    private readonly loginService: LoginService,
  ) { }

  @Post("request-otp")
  async request(
    @Body(zodPipe(resetPinRequest)) body: z.infer<typeof resetPinRequest>,
  ): Promise<OtpRequestResponse> {
    return this.requestOtp.execute(body);
  }

  @Post("login")
  async login(
    @Body(zodPipe(loginRequest)) body: z.infer<typeof loginRequest>,
  ): Promise<AuthSession> {
    return this.loginService.execute(body);
  }

  @Post("request-pin-reset")
  async requestPinReset(
    @Body(zodPipe(resetPinRequest)) body: z.infer<typeof resetPinRequest>,
  ): Promise<OtpRequestResponse> {
    return this.requestOtp.execute(body);
  }

  @Post("reset-pin")
  async resetPin(
    @Body(zodPipe(resetPinVerifyRequest))
    body: z.infer<typeof resetPinVerifyRequest>,
  ): Promise<AuthSession> {
    return this.verifyOtp.execute(body, "SIGN_IN");
  }

  @Post("signup")
  async signup(
    @Body(zodPipe(signupRequest)) body: z.infer<typeof signupRequest>,
  ): Promise<OtpRequestResponse> {
    return this.requestOtp.execute(body);
  }

  @Post("signup/send-otp")
  async signupSendOtp(
    @Body(zodPipe(signupRequest)) body: z.infer<typeof signupRequest>,
  ): Promise<OtpRequestResponse> {
    return this.requestOtp.execute(body);
  }

  @Post("signup/verify-otp")
  async signupVerify(
    @Body(zodPipe(verifySignupRequest))
    body: z.infer<typeof verifySignupRequest>,
  ): Promise<AuthSession> {
    return this.verifyOtp.execute(body, "SIGN_UP");
  }

  @Post("verify-otp")
  async verify(
    @Body(zodPipe(verifyOtpRequest))
    body: z.infer<typeof verifyOtpRequest>,
  ): Promise<AuthSession> {
    return this.verifyOtp.execute(body, "SIGN_IN");
  }

  @Post("refresh")
  async refresh(
    @Body(zodPipe(refreshRequest)) body: RefreshRequest,
  ): Promise<AuthTokens> {
    return this.refreshToken.execute(body);
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async signOut(
    @Body(zodPipe(logoutRequest)) body: LogoutRequest,
  ): Promise<void> {
    await this.logout.execute(body);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUserId() userId: string): Promise<SessionUser> {
    return this.getMe.execute(userId);
  }
}
