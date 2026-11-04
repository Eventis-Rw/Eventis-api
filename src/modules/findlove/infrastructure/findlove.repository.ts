import { Injectable } from "@nestjs/common";
import type {
  AgeDocumentType,
  AgeVerification,
  AgeVerificationStatus,
  LoveConnection,
  LoveConnectionStatus,
  LoveGender,
  LoveInterestedIn,
  LoveProfile,
  LoveRelationshipGoal,
  Prisma,
} from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

export interface LoveProfileWithPhotos extends LoveProfile {
  photos: Array<{
    id: string;
    key: string;
    position: number;
    isPrimary: boolean;
  }>;
}

@Injectable()
export class FindLoveRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getLatestAgeVerification(
    userId: string,
  ): Promise<AgeVerification | null> {
    return this.prisma.ageVerification.findFirst({
      where: { userId },
      orderBy: { submittedAt: "desc" },
    });
  }

  async createAgeVerification(input: {
    userId: string;
    documentType: AgeDocumentType;
    frontKey: string;
    backKey: string | null;
    dateOfBirth: Date | null;
    adultConfirmedAt: Date;
  }): Promise<AgeVerification> {
    return this.prisma.ageVerification.create({ data: input });
  }

  async listAgeVerifications(params: {
    skip: number;
    take: number;
    status?: AgeVerificationStatus | undefined;
  }): Promise<{ items: AgeVerification[]; total: number }> {
    const where: Prisma.AgeVerificationWhereInput = params.status
      ? { status: params.status }
      : {};
    const [items, total] = await Promise.all([
      this.prisma.ageVerification.findMany({
        where,
        orderBy: { submittedAt: "desc" },
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.ageVerification.count({ where }),
    ]);
    return { items, total };
  }

  async reviewAgeVerification(input: {
    id: string;
    status: AgeVerificationStatus;
    reviewerId: string;
    rejectionReason: string | null;
    dateOfBirth: Date | null;
    now: Date;
  }): Promise<AgeVerification | null> {
    const existing = await this.prisma.ageVerification.findUnique({
      where: { id: input.id },
    });
    if (!existing) return null;
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ageVerification.update({
        where: { id: input.id },
        data: {
          status: input.status,
          reviewedBy: input.reviewerId,
          reviewedAt: input.now,
          rejectionReason: input.rejectionReason,
          ...(input.dateOfBirth ? { dateOfBirth: input.dateOfBirth } : {}),
        },
      });
      if (input.status === "VERIFIED" && input.dateOfBirth) {
        await tx.user.update({
          where: { id: row.userId },
          data: { dateOfBirth: input.dateOfBirth },
        });
      }
      return row;
    });
  }

  async getProfile(userId: string): Promise<LoveProfileWithPhotos | null> {
    return this.prisma.loveProfile.findUnique({
      where: { userId },
      include: { photos: { orderBy: { position: "asc" } } },
    });
  }

  async findProfileById(
    id: string,
  ): Promise<LoveProfileWithPhotos | null> {
    return this.prisma.loveProfile.findUnique({
      where: { id },
      include: { photos: { orderBy: { position: "asc" } } },
    });
  }

  async usernameExists(username: string): Promise<boolean> {
    return (
      (await this.prisma.loveProfile.count({ where: { username } })) > 0
    );
  }

  async createProfile(input: {
    userId: string;
    username: string;
    gender: LoveGender;
    interestedIn: LoveInterestedIn;
    dateOfBirth: Date;
    country: string;
    city: string;
    neighborhood: string;
    occupation: string | null;
    bio: string | null;
    interests: string[];
    relationshipGoal: LoveRelationshipGoal | null;
    lookingFor: string | null;
    photoKeys: string[];
  }): Promise<LoveProfileWithPhotos> {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.loveProfile.create({
        data: {
          userId: input.userId,
          username: input.username,
          gender: input.gender,
          interestedIn: input.interestedIn,
          dateOfBirth: input.dateOfBirth,
          country: input.country,
          city: input.city,
          neighborhood: input.neighborhood,
          occupation: input.occupation,
          bio: input.bio,
          interests: input.interests,
          relationshipGoal: input.relationshipGoal,
          lookingFor: input.lookingFor,
          photos: {
            create: input.photoKeys.map((key, index) => ({
              key,
              position: index,
              isPrimary: index === 0,
            })),
          },
        },
      });
      await tx.user.update({
        where: { id: input.userId },
        data: {
          dateOfBirth: input.dateOfBirth,
          gender: input.gender,
          findLoveProfileType: "PRIVATE",
        },
      });
      return tx.loveProfile.findUniqueOrThrow({
        where: { id: profile.id },
        include: { photos: { orderBy: { position: "asc" } } },
      });
    });
  }

  async updateProfile(
    userId: string,
    data: {
      gender?: LoveGender | undefined;
      interestedIn?: LoveInterestedIn | undefined;
      dateOfBirth?: Date | undefined;
      country?: string | undefined;
      city?: string | undefined;
      neighborhood?: string | undefined;
      occupation?: string | null | undefined;
      bio?: string | null | undefined;
      interests?: string[] | undefined;
      relationshipGoal?: LoveRelationshipGoal | null | undefined;
      lookingFor?: string | null | undefined;
      isHidden?: boolean | undefined;
      lastActiveAt?: Date | undefined;
    },
  ): Promise<LoveProfileWithPhotos> {
    await this.prisma.loveProfile.update({
      where: { userId },
      data: definedOnly(data) as Prisma.LoveProfileUpdateInput,
    });
    return this.prisma.loveProfile.findUniqueOrThrow({
      where: { userId },
      include: { photos: { orderBy: { position: "asc" } } },
    });
  }

  async replacePhotos(
    userId: string,
    profileId: string,
    keys: string[],
  ): Promise<LoveProfileWithPhotos> {
    await this.prisma.$transaction(async (tx) => {
      await tx.loveProfilePhoto.deleteMany({ where: { profileId } });
      if (keys.length) {
        await tx.loveProfilePhoto.createMany({
          data: keys.map((key, index) => ({
            profileId,
            key,
            position: index,
            isPrimary: index === 0,
          })),
        });
      }
      await tx.loveProfile.update({
        where: { userId },
        data: { updatedAt: new Date() },
      });
    });
    return this.prisma.loveProfile.findUniqueOrThrow({
      where: { userId },
      include: { photos: { orderBy: { position: "asc" } } },
    });
  }

  async discover(input: {
    requesterId: string;
    requesterGender: LoveGender;
    requesterInterestedIn: LoveInterestedIn;
    skip: number;
    take: number;
    country?: string | undefined;
    city?: string | undefined;
    gender?: LoveGender | undefined;
    minAge?: number | undefined;
    maxAge?: number | undefined;
  }): Promise<{ items: LoveProfileWithPhotos[]; total: number }> {
    const now = new Date();
    const targetGenders =
      input.requesterInterestedIn === "WOMEN"
        ? (["WOMAN"] as LoveGender[])
        : input.requesterInterestedIn === "MEN"
          ? (["MAN"] as LoveGender[])
          : (["MAN", "WOMAN", "PREFER_NOT_TO_SAY"] as LoveGender[]);
    const targetInterestedIn: LoveInterestedIn[] =
      input.requesterGender === "MAN"
        ? ["MEN", "EVERYONE"]
        : input.requesterGender === "WOMAN"
          ? ["WOMEN", "EVERYONE"]
          : ["WOMEN", "MEN", "EVERYONE"];

    const where: Prisma.LoveProfileWhereInput = {
      userId: { not: input.requesterId },
      isHidden: false,
      gender: input.gender ?? { in: targetGenders },
      interestedIn: { in: targetInterestedIn },
      ...(input.country ? { country: input.country } : {}),
      ...(input.city ? { city: input.city } : {}),
      ...(input.minAge || input.maxAge
        ? {
            dateOfBirth: {
              ...(input.maxAge
                ? { gte: dateYearsAgo(now, input.maxAge) }
                : {}),
              ...(input.minAge
                ? { lte: dateYearsAgo(now, input.minAge) }
                : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.loveProfile.findMany({
        where,
        include: { photos: { orderBy: { position: "asc" } } },
        orderBy: [{ lastActiveAt: "desc" }, { createdAt: "desc" }],
        skip: input.skip,
        take: input.take,
      }),
      this.prisma.loveProfile.count({ where }),
    ]);
    return { items, total };
  }

  async findLike(fromProfileId: string, toProfileId: string) {
    return this.prisma.loveLike.findUnique({
      where: { fromProfileId_toProfileId: { fromProfileId, toProfileId } },
    });
  }

  async createLike(fromProfileId: string, toProfileId: string) {
    return this.prisma.loveLike.upsert({
      where: { fromProfileId_toProfileId: { fromProfileId, toProfileId } },
      create: { fromProfileId, toProfileId },
      update: {},
    });
  }

  async findConnectionBetween(profileA: string, profileB: string) {
    return this.prisma.loveConnection.findFirst({
      where: {
        OR: [
          { fromProfileId: profileA, toProfileId: profileB },
          { fromProfileId: profileB, toProfileId: profileA },
        ],
      },
    });
  }

  async upsertAcceptedConnection(
    fromProfileId: string,
    toProfileId: string,
  ): Promise<LoveConnection> {
    const existing = await this.findConnectionBetween(
      fromProfileId,
      toProfileId,
    );
    if (existing) {
      if (existing.status === "ACCEPTED") return existing;
      return this.prisma.loveConnection.update({
        where: { id: existing.id },
        data: { status: "ACCEPTED", respondedAt: new Date() },
      });
    }
    return this.prisma.loveConnection.create({
      data: {
        fromProfileId,
        toProfileId,
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    });
  }

  async createConnection(input: {
    fromProfileId: string;
    toProfileId: string;
    message: string | null;
  }): Promise<LoveConnection> {
    return this.prisma.loveConnection.create({
      data: { ...input, status: "PENDING" },
    });
  }

  async findConnection(id: string) {
    return this.prisma.loveConnection.findUnique({
      where: { id },
      include: {
        fromProfile: true,
        toProfile: true,
      },
    });
  }

  async updateConnectionStatus(
    id: string,
    status: LoveConnectionStatus,
    respondedAt: Date | null,
  ): Promise<LoveConnection> {
    return this.prisma.loveConnection.update({
      where: { id },
      data: { status, respondedAt },
    });
  }

  async listConnections(input: {
    profileId: string;
    direction: "incoming" | "outgoing" | "accepted";
  }) {
    const where: Prisma.LoveConnectionWhereInput =
      input.direction === "incoming"
        ? { toProfileId: input.profileId, status: "PENDING" }
        : input.direction === "outgoing"
          ? { fromProfileId: input.profileId, status: { in: ["PENDING", "ACCEPTED"] } }
          : {
              status: "ACCEPTED",
              OR: [
                { fromProfileId: input.profileId },
                { toProfileId: input.profileId },
              ],
            };
    return this.prisma.loveConnection.findMany({
      where,
      include: {
        fromProfile: { include: { photos: { orderBy: { position: "asc" } } } },
        toProfile: { include: { photos: { orderBy: { position: "asc" } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async touchProfile(profileId: string, now: Date): Promise<void> {
    await this.prisma.loveProfile.update({
      where: { id: profileId },
      data: { lastActiveAt: now },
    });
  }
}

export function dateYearsAgo(now: Date, years: number): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()),
  );
}

function definedOnly<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as T;
}
