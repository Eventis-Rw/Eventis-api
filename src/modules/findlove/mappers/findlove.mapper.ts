import type { AgeVerification, LoveConnection } from "@prisma/client";

import type { LoveProfileWithPhotos } from "../infrastructure/findlove.repository.js";

export function ageFromDate(dateOfBirth: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const month = now.getUTCMonth() - dateOfBirth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < dateOfBirth.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function toLoveProfileResponse(profile: LoveProfileWithPhotos) {
  return {
    id: profile.id,
    userId: profile.userId,
    username: profile.username,
    gender: profile.gender,
    interestedIn: profile.interestedIn,
    dateOfBirth: profile.dateOfBirth.toISOString().slice(0, 10),
    age: ageFromDate(profile.dateOfBirth),
    country: profile.country,
    city: profile.city,
    neighborhood: profile.neighborhood,
    occupation: profile.occupation,
    bio: profile.bio,
    interests: profile.interests,
    relationshipGoal: profile.relationshipGoal,
    lookingFor: profile.lookingFor,
    isHidden: profile.isHidden,
    lastActiveAt: profile.lastActiveAt?.toISOString() ?? null,
    photos: profile.photos.map((photo) => ({
      id: photo.id,
      key: photo.key,
      position: photo.position,
      isPrimary: photo.isPrimary,
    })),
    createdAt: profile.createdAt.toISOString(),
  };
}

export function toAgeVerificationResponse(row: AgeVerification) {
  return {
    id: row.id,
    documentType: row.documentType,
    status: row.status,
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  };
}

export function toConnectionResponse(
  row: LoveConnection & {
    fromProfile?: LoveProfileWithPhotos | null;
    toProfile?: LoveProfileWithPhotos | null;
  },
  viewerProfileId: string,
) {
  const other =
    row.fromProfileId === viewerProfileId ? row.toProfile : row.fromProfile;
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    conversationId: row.conversationId,
    direction:
      row.fromProfileId === viewerProfileId ? "outgoing" : "incoming",
    otherProfile: other ? toLoveProfileResponse(other) : null,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt?.toISOString() ?? null,
  };
}
