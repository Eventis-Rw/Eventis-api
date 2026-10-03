import { ERROR_CODES } from "@eventis/contracts";
import { Inject, Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import type { RegisterUserDto } from "../api/dto/register-user.dto.js";
import { createUser, type User } from "../domain/user.js";
import type { UserRepository } from "../infrastructure/user.repository.js";

import type { PasswordHasher } from "./password-hasher.js";

@Injectable()
export class RegisterUserService {
  constructor(
    @Inject("UserRepository")
    private readonly userRepository: UserRepository,
    @Inject("PasswordHasher")
    private readonly passwordHasher: PasswordHasher,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterUserDto): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw AppError.conflict(
        ERROR_CODES.INTERNAL_ERROR,
        "Email is already registered",
      );
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const user = createUser(
      {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        passwordHash,
        accountType: input.accountType,
        organizationName: input.organizationName ?? null,
        organizationDescription: input.organizationDescription ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        gender: input.gender ?? null,
        bio: input.bio ?? null,
        location: input.location ?? null,
        interestedIn: input.interestedIn ?? null,
      },
      this.clock.now(),
    );

    return this.userRepository.create(user);
  }
}
