import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  logoutRequest,
  otpRequest,
  otpVerify,
  refreshRequest,
  type AuthSession,
  type AuthTokens,
  type LogoutRequest,
  type OtpRequest,
  type OtpRequestResponse,
  type OtpVerify,
  type RefreshRequest,
  type SessionUser,
} from "@eventis/contracts";
import { z } from "zod";

import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { GetMeService } from "../application/get-me.service.js";
import { LogoutService } from "../application/logout.service.js";
import { RefreshTokenService } from "../application/refresh-token.service.js";
import { RequestOtpService } from "../application/request-otp.service.js";
import { VerifyOtpService } from "../application/verify-otp.service.js";
import { LoginService } from "../application/login.service.js";

import { CurrentUserId, JwtAuthGuard } from "./jwt-auth.guard.js";

const verifyOtpRequest = otpVerify.extend({
  displayName: z.string().trim().min(2).max(60).optional(),
});
const verifySignupRequest = otpVerify.omit({ deviceId: true }).extend({
  displayName: z.string().trim().min(2).max(60).optional(),
});
const signupRequest = z.object({
  phone: otpRequest.shape.phone,
  username: z.string().trim().min(2).max(100).optional(),
  firstName: z.string().trim().min(2).max(100).optional(),
  accountType: z.enum(["POSTER", "LOVE"]).default("LOVE"),
}).refine((value) => Boolean(value.username ?? value.firstName), {
  message: "username is required",
  path: ["username"],
}).transform(({ username, firstName, ...value }) => ({
  ...value,
  firstName: username ?? firstName!,
}));
const deviceIdHeader = z.string().trim().min(8).max(128);
const deviceCredentialHeader = z.string().min(32).max(256);
const loginRequest = z.object({
  phone: otpRequest.shape.phone,
});

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
    @Body(zodPipe(otpRequest)) body: OtpRequest,
  ): Promise<OtpRequestResponse> {
    return this.requestOtp.execute(body);
  }

  @Post("login")
  async login(
    @Body(zodPipe(loginRequest)) body: z.infer<typeof loginRequest>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<AuthSession> {
    const deviceId = zodPipe(deviceIdHeader).transform(headers["x-device-id"]);
    const deviceCredential = zodPipe(deviceCredentialHeader).transform(
      headers["x-device-credential"],
    );
    return this.loginService.execute({ ...body, deviceId, deviceCredential });
  }

  @Post("signup")
  async signup(
    @Body(zodPipe(signupRequest)) body: z.infer<typeof signupRequest>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<OtpRequestResponse> {
    const deviceId = zodPipe(deviceIdHeader).transform(headers["x-device-id"]);
    return this.requestOtp.execute({ ...body, deviceId });
  }

  @Post("signup/send-otp")
  async signupSendOtp(
    @Body(zodPipe(signupRequest)) body: z.infer<typeof signupRequest>,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<OtpRequestResponse> {
    const deviceId = zodPipe(deviceIdHeader).transform(headers["x-device-id"]);
    return this.requestOtp.execute({ ...body, deviceId });
  }

  @Post("signup/verify-otp")
  async signupVerify(
    @Body(zodPipe(verifySignupRequest))
    body: OtpVerify & { displayName?: string },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<AuthSession> {
    const deviceId = zodPipe(deviceIdHeader).transform(headers["x-device-id"]);
    return this.verifyOtp.execute({ ...body, deviceId }, "SIGN_UP");
  }

  @Post("verify-otp")
  async verify(
    @Body(zodPipe(verifyOtpRequest))
    body: OtpVerify & { displayName?: string },
  ): Promise<AuthSession> {
    return this.verifyOtp.execute(body);
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
