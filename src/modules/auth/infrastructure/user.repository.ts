import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";
import type { User } from "../domain/user.js";

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!row) {
      return null;
    }

    return this.toDomain(row);
  }

  async create(input: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    passwordHash: string;
    accountType: User["accountType"];
    status: User["status"];
    organizationName: string | null;
    organizationDescription: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    bio: string | null;
    location: string | null;
    interestedIn: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Promise<User> {
    const row = await this.prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        passwordHash: input.passwordHash,
        accountType: input.accountType,
        status: input.status,
        organizationName: input.organizationName,
        organizationDescription: input.organizationDescription,
        dateOfBirth: input.dateOfBirth,
        gender: input.gender,
        bio: input.bio,
        location: input.location,
        interestedIn: input.interestedIn,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
      },
    });

    return this.toDomain(row);
  }

  private toDomain(row: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    passwordHash: string;
    accountType: User["accountType"];
    status: User["status"];
    organizationName: string | null;
    organizationDescription: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    bio: string | null;
    location: string | null;
    interestedIn: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      phone: row.phone,
      passwordHash: row.passwordHash,
      accountType: row.accountType,
      status: row.status,
      organizationName: row.organizationName,
      organizationDescription: row.organizationDescription,
      dateOfBirth: row.dateOfBirth,
      gender: row.gender,
      bio: row.bio,
      location: row.location,
      interestedIn: row.interestedIn,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
