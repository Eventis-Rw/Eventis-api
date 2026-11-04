import type {
  EventReportRow,
  ReviewRow,
  SavedEventRow,
  SavedOrganiserRow,
} from "../infrastructure/engagement.repository.js";

export interface SavedEventResponse {
  eventId: string;
  title: string;
  coverImage: string | null;
  category: string | null;
  location: string;
  startDate: string;
  time: string;
  status: string;
  posterId: string;
  savedAt: string;
}

export interface SavedOrganiserResponse {
  organisationId: string;
  name: string;
  description: string;
  location: string;
  logoKey: string | null;
  verificationStatus: string;
  savedAt: string;
}

export interface ReviewResponse {
  id: string;
  eventId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface EventReportResponse {
  id: string;
  eventId: string;
  reporterId: string;
  reason: string;
  details: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export function toSavedEventResponse(row: SavedEventRow): SavedEventResponse {
  return {
    eventId: row.event.eventId,
    title: row.event.title,
    coverImage: row.event.coverImage,
    category: row.event.category,
    location: row.event.location,
    startDate: row.event.startDate.toISOString().slice(0, 10),
    time: row.event.time,
    status: row.event.status,
    posterId: row.event.posterId,
    savedAt: row.createdAt.toISOString(),
  };
}

export function toSavedOrganiserResponse(
  row: SavedOrganiserRow,
): SavedOrganiserResponse {
  return {
    organisationId: row.organisation.id,
    name: row.organisation.name,
    description: row.organisation.description,
    location: row.organisation.location,
    logoKey: row.organisation.logoKey,
    verificationStatus: row.organisation.verificationStatus,
    savedAt: row.createdAt.toISOString(),
  };
}

export function toReviewResponse(row: ReviewRow): ReviewResponse {
  return {
    id: row.id,
    eventId: row.eventId,
    userId: row.userId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: {
      displayName:
        row.user?.displayName ??
        [row.user?.firstName, row.user?.lastName].filter(Boolean).join(" ") ??
        null,
      avatarUrl: row.user?.avatarUrl ?? null,
    },
  };
}

export function toEventReportResponse(
  row: EventReportRow,
): EventReportResponse {
  return {
    id: row.id,
    eventId: row.eventId,
    reporterId: row.reporterId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
