import { z } from "zod";

const baseRegisterUserDto = z.object({
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  email: z.email(),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(8).max(128),
  accountType: z.enum(["POSTER", "LOVE"]),

  organizationName: z.string().trim().min(2).max(160).optional(),
  organizationDescription: z.string().trim().max(10_000).optional(),

  dateOfBirth: z.coerce.date().optional(),
  gender: z.string().trim().min(1).max(30).optional(),
  bio: z.string().trim().max(10_000).optional(),
  location: z.string().trim().max(160).optional(),
  interestedIn: z.string().trim().max(30).optional(),
});

export const registerUserDto = baseRegisterUserDto.superRefine(
  (value, context) => {
    if (value.accountType === "POSTER" && !value.organizationName) {
      context.addIssue({
        code: "custom",
        path: ["organizationName"],
        message: "organizationName is required for POSTER accounts",
      });
    }

    if (value.accountType === "LOVE") {
      if (!value.dateOfBirth) {
        context.addIssue({
          code: "custom",
          path: ["dateOfBirth"],
          message: "dateOfBirth is required for LOVE accounts",
        });
      }

      if (!value.gender) {
        context.addIssue({
          code: "custom",
          path: ["gender"],
          message: "gender is required for LOVE accounts",
        });
      }
    }
  },
);

export type RegisterUserDto = z.infer<typeof registerUserDto>;
