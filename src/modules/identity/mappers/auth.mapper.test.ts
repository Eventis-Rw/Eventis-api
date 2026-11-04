import { describe, expect, it } from "bun:test";

import type { User } from "../domain/user.js";

import { toAuthRoles } from "./auth.mapper.js";

const user = (overrides: Partial<User> = {}): User => ({
  id: "11111111-1111-1111-1111-111111111111",
  phone: "+250788000000",
  firstName: "Aline",
  lastName: "Uwase",
  email: null,
  accountType: "POSTER",
  findLoveProfileType: "PRIVATE",
  role: "ADMIN",
  organizationName: null,
  organizationDescription: null,
  dateOfBirth: null,
  gender: null,
  bio: null,
  location: null,
  interestedIn: null,
  displayName: "Aline Uwase",
  avatarUrl: null,
  pinHash: null,
  username: null,
  posterKind: "INDIVIDUAL",
  termsVersion: null,
  termsAcceptedAt: null,
  profileVisibility: "PUBLIC",
  lastSeenAt: null,
  deletedAt: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides,
});

describe("toAuthRoles", () => {
  it("includes every role derived from the authoritative user record", () => {
    expect(toAuthRoles(user())).toEqual(["admin", "organizer_owner"]);
  });

  it("does not grant organizer permissions to a customer administrator", () => {
    expect(toAuthRoles(user({ accountType: "CUSTOMER" }))).toEqual(["admin"]);
  });

  it("assigns customer to a regular customer account", () => {
    expect(
      toAuthRoles(user({ role: "CUSTOMER", accountType: "CUSTOMER" })),
    ).toEqual(["customer"]);
  });
});
