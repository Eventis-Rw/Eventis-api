import type { User } from "../domain/user.js";

export interface UserResponse {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountType: User["accountType"];
  status: User["status"];

  organizationName: string | null;
  organizationDescription: string | null;

  dateOfBirth: string | null;
  gender: string | null;
  bio: string | null;
  location: string | null;
  interestedIn: string | null;

  createdAt: string;
  updatedAt: string;
}

export function toUserResponse(user: User): UserResponse {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    accountType: user.accountType,
    status: user.status,

    organizationName: user.organizationName,
    organizationDescription: user.organizationDescription,

    dateOfBirth: user.dateOfBirth?.toISOString() ?? null,
    gender: user.gender,
    bio: user.bio,
    location: user.location,
    interestedIn: user.interestedIn,

    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
