export const ACCOUNT_TYPES = ["POSTER", "LOVE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const USER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export interface User {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly passwordHash: string;
  readonly accountType: AccountType;
  readonly status: UserStatus;

  readonly organizationName: string | null;
  readonly organizationDescription: string | null;

  readonly dateOfBirth: Date | null;
  readonly gender: string | null;
  readonly bio: string | null;
  readonly location: string | null;
  readonly interestedIn: string | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateUserProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  passwordHash: string;
  accountType: AccountType;

  organizationName?: string | null;
  organizationDescription?: string | null;

  dateOfBirth?: Date | null;
  gender?: string | null;
  bio?: string | null;
  location?: string | null;
  interestedIn?: string | null;
}

export function createUser(
  props: CreateUserProps,
  now: Date,
): Omit<User, "id"> {
  return {
    firstName: props.firstName,
    lastName: props.lastName,
    email: props.email,
    phone: props.phone,
    passwordHash: props.passwordHash,
    accountType: props.accountType,
    status: "ACTIVE",

    organizationName: props.organizationName ?? null,
    organizationDescription: props.organizationDescription ?? null,

    dateOfBirth: props.dateOfBirth ?? null,
    gender: props.gender ?? null,
    bio: props.bio ?? null,
    location: props.location ?? null,
    interestedIn: props.interestedIn ?? null,

    createdAt: now,
    updatedAt: now,
  };
}