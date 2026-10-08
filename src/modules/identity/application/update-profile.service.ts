import { Injectable } from "@nestjs/common";
import { z } from "zod";

import { AppError } from "../../../common/errors/app-error.js";
import type { User } from "../domain/user.js";
import { UserRepository } from "../infrastructure/identity.repository.js";
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
    dateOfBirth: z
      .string()
      .regex(
        /^\d{4}[-\u002F]\d{2}[-\u002F]\d{2}$/,
        "Use YYYY-MM-DD or YYYY/MM/DD",
      )
      .refine((value) => {
        const normalized = value.replaceAll("/", "-");
        const parts = normalized.split("-").map(Number);
        if (
          parts.length !== 3 ||
          parts.some((part) => !Number.isInteger(part))
        ) {
          return false;
        }
        const year = parts[0]!;
        const month = parts[1]!;
        const day = parts[2]!;
        const date = new Date(Date.UTC(year, month - 1, day));
        return (
          date.getUTCFullYear() === year &&
          date.getUTCMonth() === month - 1 &&
          date.getUTCDate() === day
        );
      }, "Enter a valid calendar date")
      .transform((value) => value.replaceAll("/", "-"))
      .nullable()
      .optional(),
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
  constructor(private readonly users: UserRepository) {}

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
        if (input.dateOfBirth) {
          const parts = input.dateOfBirth.split("-").map((p) => Number(p));
          if (parts.length === 3 && parts.every((n) => Number.isInteger(n))) {
            const y = parts[0]!;
            const m = parts[1]!;
            const d = parts[2]!;
            data.dateOfBirth = new Date(Date.UTC(y, m - 1, d));
          } else {
            data.dateOfBirth = null;
          }
        } else {
          data.dateOfBirth = null;
        }
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
