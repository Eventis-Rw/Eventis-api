import { Module } from "@nestjs/common";

import { PrismaModule } from "../../infrastructure/database/prisma.module.js";
import { PlatformModule } from "../platform/index.js";

import { AuthController } from "./api/auth.controller.js";
import { RegisterUserService } from "./application/register-user.service.js";
import { ScryptPasswordHasher } from "./infrastructure/password-hasher.js";
import { UserRepository } from "./infrastructure/user.repository.js";

@Module({
  imports: [PlatformModule, PrismaModule],
  controllers: [AuthController],
  providers: [
    RegisterUserService,
    UserRepository,
    {
      provide: "UserRepository",
      useExisting: UserRepository,
    },
    ScryptPasswordHasher,
    {
      provide: "PasswordHasher",
      useExisting: ScryptPasswordHasher,
    },
  ],
  exports: [RegisterUserService],
})
export class AuthModule {}
