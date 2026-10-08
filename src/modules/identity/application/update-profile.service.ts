import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { AppError } from "../../../common/errors/app-error.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
import type { User } from "../domain/user.js";
import { toProfileResponse } from "../mappers/auth.mapper.js";

export const updateProfileSchema = z
  .object({
    firstName: z.string().trim().min(2).max(100).optional(),
    lastName: z.string().trim().min(2).max(100).nullable().optional(),
    displayName: z.string().trim().min(2).max(60).nullable().optional(),
    email: z.email().trim().max(255).nullable().optional(),
    avatarUrl: z.string().trim().url().max(500).nullable().optional(),
    accountType: z.enum(["POSTER", "LOVE"]).optional(),
    organizationName: z.string().trim().max(160).nullable().optional(),
    organizationDescription: z.string().trim().max(10000).nullable().optional(),
    dateOfBirth: z.iso.date().nullable().optional(),
    gender: z.string().trim().max(30).nullable().optional(),
    bio: z.string().trim().max(10000).nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    interestedIn: z.string().trim().max(30).nullable().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one profile field is required",
  );

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
type EditableUserProfile = {
  -readonly [
  Key in keyof Pick<
    User,
    | "firstName"
    | "lastName"
    | "displayName"
    | "email"
    | "avatarUrl"
    | "accountType"
    | "organizationName"
    | "organizationDescription"
    | "dateOfBirth"
    | "gender"
    | "bio"
    | "location"
    | "interestedIn"
  >
  ]?: User[Key];
};

@Injectable()
export class UpdateProfileService {
  constructor(private readonly users: UserRepository) { }

  async execute(userId: string, input: UpdateProfileInput) {
    try {
      const data: EditableUserProfile = {};
      if (input.firstName !== undefined) data.firstName = input.firstName;
      if (input.lastName !== undefined) data.lastName = input.lastName;
      if (input.displayName !== undefined) data.displayName = input.displayName;
      if (input.email !== undefined) data.email = input.email;
      if (input.avatarUrl !== undefined) data.avatarUrl = input.avatarUrl;
      if (input.accountType !== undefined) data.accountType = input.accountType;
      if (input.organizationName !== undefined)
        data.organizationName = input.organizationName;
      if (input.organizationDescription !== undefined)
        data.organizationDescription = input.organizationDescription;
      if (input.dateOfBirth !== undefined) {
        data.dateOfBirth = input.dateOfBirth
          ? new Date(`${input.dateOfBirth}T00:00:00.000Z`)
          : null;
      }
      if (input.gender !== undefined) data.gender = input.gender;
      if (input.bio !== undefined) data.bio = input.bio;
      if (input.location !== undefined) data.location = input.location;
      if (input.interestedIn !== undefined)
        data.interestedIn = input.interestedIn;
      const user = await this.users.updateProfile(userId, data);
      return toProfileResponse(user);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "P2002"
      ) {
        throw new AppError("FORBIDDEN", "Email address is already in use", 409);
      }
      throw error;
    }
  }
}
