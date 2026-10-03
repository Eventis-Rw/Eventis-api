import { Body, Controller, Post } from "@nestjs/common";

import { zodPipe } from "../../../common/pipes/zod-validation.pipe.js";
import { RegisterUserService } from "../application/register-user.service.js";
import { toUserResponse, type UserResponse } from "../mappers/user.mapper.js";

import {
  registerUserDto,
  type RegisterUserDto,
} from "./dto/register-user.dto.js";

@Controller({ path: "auth", version: "1" })
export class AuthController {
  constructor(private readonly registerUser: RegisterUserService) {}

  @Post("register")
  async register(
    @Body(zodPipe(registerUserDto)) body: RegisterUserDto,
  ): Promise<UserResponse> {
    return toUserResponse(await this.registerUser.execute(body));
  }
}
