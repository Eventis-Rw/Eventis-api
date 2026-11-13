import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import type {
  AgeDocumentType,
  AgeVerificationStatus,
  LoveGender,
  LoveInterestedIn,
  LoveRelationshipGoal,
} from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import {
  FindLoveRepository,
} from "../infrastructure/findlove.repository.js";
import {
  ageFromDate,
  toAgeVerificationResponse,
  toConnectionResponse,
  toLoveProfileResponse,
} from "../mappers/findlove.mapper.js";

const MIN_AGE = 18;

@Injectable()
export class FindLoveService {
  constructor(
    private readonly findlove: FindLoveRepository,
    private readonly clock: Clock,
  ) {}

  async submitAgeVerification(
    userId: string,
    input: {
      documentType: AgeDocumentType;
      frontKey: string;
      backKey?: string | null | undefined;
      dateOfBirth?: Date | undefined;
      adultConfirmed: boolean;
    },
  ) {
    if (!input.adultConfirmed) {
      throw AppError.validation({
        adultConfirmed: ["Confirm that you are at least 18 years old"],
      });
    }
    if (input.dateOfBirth && ageFromDate(input.dateOfBirth) < MIN_AGE) {
      throw AppError.validation({
        dateOfBirth: ["You must be at least 18 years old"],
      });
    }
    const row = await this.findlove.createAgeVerification({
      userId,
      documentType: input.documentType,
      frontKey: input.frontKey.trim(),
      backKey: input.backKey?.trim() || null,
      dateOfBirth: input.dateOfBirth ?? null,
      adultConfirmedAt: this.clock.now(),
    });
    return toAgeVerificationResponse(row);
  }

  async getAgeVerification(userId: string) {
    const row = await this.findlove.getLatestAgeVerification(userId);
    return row ? toAgeVerificationResponse(row) : null;
  }

  async listAgeVerifications(input: {
    page: number;
    limit: number;
    status?: AgeVerificationStatus | undefined;
  }) {
    const { items, total } = await this.findlove.listAgeVerifications({
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      status: input.status,
    });
    return {
      items: items.map(toAgeVerificationResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async reviewAgeVerification(
    adminUserId: string,
    id: string,
    input: {
      status: AgeVerificationStatus;
      rejectionReason?: string | null | undefined;
      dateOfBirth?: Date | undefined;
    },
  ) {
    if (input.status === "REJECTED" && !input.rejectionReason?.trim()) {
      throw AppError.validation({
        rejectionReason: ["Explain why the verification was rejected"],
      });
    }
    if (
      input.status === "VERIFIED" &&
      input.dateOfBirth &&
      ageFromDate(input.dateOfBirth) < MIN_AGE
    ) {
      throw AppError.validation({
        dateOfBirth: ["The verified date of birth is under 18"],
      });
    }
    const row = await this.findlove.reviewAgeVerification({
      id,
      status: input.status,
      reviewerId: adminUserId,
      rejectionReason:
        input.status === "REJECTED"
          ? (input.rejectionReason?.trim() ?? null)
          : null,
      dateOfBirth: input.dateOfBirth ?? null,
      now: this.clock.now(),
    });
    if (!row) throw AppError.notFound("That age verification");
    return toAgeVerificationResponse(row);
  }

  async getMyProfile(userId: string) {
    const profile = await this.findlove.getProfile(userId);
    return profile ? toLoveProfileResponse(profile) : null;
  }

  async getProfileById(userId: string, profileId: string) {
    await this.requireProfile(userId);
    const profile = await this.findlove.findProfileById(profileId);
    if (!profile || profile.isHidden) {
      throw AppError.notFound("That Love profile");
    }
    return toLoveProfileResponse(profile);
  }

  async createProfile(
    userId: string,
    input: {
      username: string;
      gender: LoveGender;
      interestedIn: LoveInterestedIn;
      dateOfBirth: Date;
      country: string;
      city: string;
      neighborhood: string;
      occupation?: string | null | undefined;
      bio?: string | null | undefined;
      interests?: string[] | undefined;
      relationshipGoal?: LoveRelationshipGoal | null | undefined;
      lookingFor?: string | null | undefined;
      photoKeys?: string[] | undefined;
    },
  ) {
    if (ageFromDate(input.dateOfBirth) < MIN_AGE) {
      throw AppError.validation({
        dateOfBirth: ["You must be at least 18 years old"],
      });
    }
    const verification = await this.findlove.getLatestAgeVerification(userId);
    if (!verification || verification.status !== "VERIFIED") {
      throw AppError.forbidden(
        "Complete age verification before creating a Love profile",
      );
    }
    const existing = await this.findlove.getProfile(userId);
    if (existing) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "You already have a Love profile",
      );
    }
    const username = normalizeUsername(input.username);
    if (await this.findlove.usernameExists(username)) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "That username is already taken",
      );
    }
    assertPhotos(input.photoKeys ?? []);
    const profile = await this.findlove.createProfile({
      userId,
      username,
      gender: input.gender,
      interestedIn: input.interestedIn,
      dateOfBirth: input.dateOfBirth,
      country: input.country.trim(),
      city: input.city.trim(),
      neighborhood: input.neighborhood.trim(),
      occupation: input.occupation?.trim() || null,
      bio: input.bio?.trim() || null,
      interests: unique(input.interests ?? []),
      relationshipGoal: input.relationshipGoal ?? null,
      lookingFor: input.lookingFor?.trim() || null,
      photoKeys: input.photoKeys ?? [],
    });
    return toLoveProfileResponse(profile);
  }

  async updateProfile(
    userId: string,
    input: {
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
    },
  ) {
    if (input.dateOfBirth && ageFromDate(input.dateOfBirth) < MIN_AGE) {
      throw AppError.validation({
        dateOfBirth: ["You must be at least 18 years old"],
      });
    }
    const profile = await this.findlove.getProfile(userId);
    if (!profile) throw AppError.notFound("Your Love profile");
    const updated = await this.findlove.updateProfile(userId, {
      ...(input.gender !== undefined ? { gender: input.gender } : {}),
      ...(input.interestedIn !== undefined
        ? { interestedIn: input.interestedIn }
        : {}),
      ...(input.dateOfBirth !== undefined
        ? { dateOfBirth: input.dateOfBirth }
        : {}),
      ...(input.country !== undefined
        ? { country: input.country.trim() }
        : {}),
      ...(input.city !== undefined ? { city: input.city.trim() } : {}),
      ...(input.neighborhood !== undefined
        ? { neighborhood: input.neighborhood.trim() }
        : {}),
      ...(input.occupation !== undefined
        ? { occupation: input.occupation?.trim() || null }
        : {}),
      ...(input.bio !== undefined
        ? { bio: input.bio?.trim() || null }
        : {}),
      ...(input.interests !== undefined
        ? { interests: unique(input.interests) }
        : {}),
      ...(input.relationshipGoal !== undefined
        ? { relationshipGoal: input.relationshipGoal }
        : {}),
      ...(input.lookingFor !== undefined
        ? { lookingFor: input.lookingFor?.trim() || null }
        : {}),
      ...(input.isHidden !== undefined ? { isHidden: input.isHidden } : {}),
      lastActiveAt: this.clock.now(),
    });
    return toLoveProfileResponse(updated);
  }

  async replacePhotos(userId: string, photoKeys: string[]) {
    assertPhotos(photoKeys);
    const profile = await this.findlove.getProfile(userId);
    if (!profile) throw AppError.notFound("Your Love profile");
    const updated = await this.findlove.replacePhotos(
      userId,
      profile.id,
      photoKeys,
    );
    return toLoveProfileResponse(updated);
  }

  async discover(
    userId: string,
    input: {
      page: number;
      limit: number;
      country?: string | undefined;
      city?: string | undefined;
      gender?: LoveGender | undefined;
      minAge?: number | undefined;
      maxAge?: number | undefined;
    },
  ) {
    const profile = await this.findlove.getProfile(userId);
    if (!profile) throw AppError.notFound("Your Love profile");
    if (profile.isHidden) {
      throw AppError.forbidden("Unhide your Love profile to browse");
    }
    if (
      input.minAge !== undefined &&
      input.maxAge !== undefined &&
      input.minAge > input.maxAge
    ) {
      throw AppError.validation({ minAge: ["minAge must be below maxAge"] });
    }
    await this.findlove.touchProfile(profile.id, this.clock.now());
    const { items, total } = await this.findlove.discover({
      requesterId: userId,
      requesterGender: profile.gender,
      requesterInterestedIn: profile.interestedIn,
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      country: input.country,
      city: input.city,
      gender: input.gender,
      minAge: input.minAge,
      maxAge: input.maxAge,
    });
    return {
      items: items.map(toLoveProfileResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async like(userId: string, targetProfileId: string) {
    const profile = await this.requireProfile(userId);
    if (profile.id === targetProfileId) {
      throw AppError.validation({ profileId: ["You cannot like yourself"] });
    }
    const target = await this.findlove.findProfileById(targetProfileId);
    if (!target || target.isHidden) {
      throw AppError.notFound("That Love profile");
    }
    await this.findlove.createLike(profile.id, target.id);
    const reciprocal = await this.findlove.findLike(target.id, profile.id);
    if (!reciprocal) {
      return { liked: true, matched: false, connectionId: null };
    }
    const connection = await this.findlove.upsertAcceptedConnection(
      profile.id,
      target.id,
    );
    return {
      liked: true,
      matched: true,
      connectionId: connection.id,
    };
  }

  async sendConnection(
    userId: string,
    input: { profileId: string; message?: string | null | undefined },
  ) {
    const profile = await this.requireProfile(userId);
    if (profile.id === input.profileId) {
      throw AppError.validation({
        profileId: ["You cannot connect with yourself"],
      });
    }
    const target = await this.findlove.findProfileById(input.profileId);
    if (!target || target.isHidden) {
      throw AppError.notFound("That Love profile");
    }
    const existing = await this.findlove.findConnectionBetween(
      profile.id,
      target.id,
    );
    if (existing) {
      if (existing.status === "ACCEPTED") {
        return { connection: toConnectionResponse(existing, profile.id) };
      }
      if (existing.status === "PENDING") {
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "A connection request already exists",
        );
      }
    }
    const connection = await this.findlove.createConnection({
      fromProfileId: profile.id,
      toProfileId: target.id,
      message: input.message?.trim() || null,
    });
    return {
      connection: toConnectionResponse(
        { ...connection, fromProfile: profile, toProfile: target },
        profile.id,
      ),
    };
  }

  async listConnections(
    userId: string,
    direction: "incoming" | "outgoing" | "accepted",
  ) {
    const profile = await this.requireProfile(userId);
    const rows = await this.findlove.listConnections({
      profileId: profile.id,
      direction,
    });
    return {
      items: rows.map((row) => toConnectionResponse(row, profile.id)),
    };
  }

  async respondToConnection(
    userId: string,
    id: string,
    status: "ACCEPTED" | "DECLINED" | "REMOVED",
  ) {
    const profile = await this.requireProfile(userId);
    const connection = await this.findlove.findConnection(id);
    if (!connection) throw AppError.notFound("That connection");
    const involved =
      connection.fromProfileId === profile.id ||
      connection.toProfileId === profile.id;
    if (!involved) throw AppError.forbidden();
    if (status === "ACCEPTED" || status === "DECLINED") {
      if (connection.toProfileId !== profile.id) {
        throw AppError.forbidden("Only the recipient can respond");
      }
      if (connection.status !== "PENDING") {
        throw AppError.conflict(
          ERROR_CODES.VALIDATION_FAILED,
          "This connection is no longer pending",
        );
      }
    }
    if (status === "REMOVED" && connection.status !== "ACCEPTED") {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "Only accepted connections can be removed",
      );
    }
    const row = await this.findlove.updateConnectionStatus(
      id,
      status,
      status === "REMOVED" ? null : this.clock.now(),
    );
    return { connection: toConnectionResponse(row, profile.id) };
  }

  private async requireProfile(userId: string) {
    const profile = await this.findlove.getProfile(userId);
    if (!profile) throw AppError.notFound("Your Love profile");
    return profile;
  }
}

function normalizeUsername(value: string): string {
  const username = value.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,20}$/.test(username)) {
    throw AppError.validation({
      username: [
        "Use 3-20 lowercase letters, numbers or underscores",
      ],
    });
  }
  return username;
}

function assertPhotos(photoKeys: string[]): void {
  if (photoKeys.length > 6) {
    throw AppError.validation({ photoKeys: ["Add at most 6 photos"] });
  }
  if (photoKeys.some((key) => !key.trim())) {
    throw AppError.validation({ photoKeys: ["Photo keys cannot be empty"] });
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
