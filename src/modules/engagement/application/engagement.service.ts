import { ERROR_CODES } from "@eventis/contracts";
import { Injectable } from "@nestjs/common";
import type { ModerationStatus } from "@prisma/client";

import { Clock } from "../../../common/clock.js";
import { AppError } from "../../../common/errors/app-error.js";
import { EngagementRepository } from "../infrastructure/engagement.repository.js";
import {
  toEventReportResponse,
  toReviewResponse,
  toSavedEventResponse,
  toSavedOrganiserResponse,
} from "../mappers/engagement.mapper.js";

export interface PageInput {
  page: number;
  limit: number;
}

@Injectable()
export class EngagementService {
  constructor(
    private readonly repository: EngagementRepository,
    private readonly clock: Clock,
  ) {}

  async eventInteractionSummary(eventId: string, userId?: string) {
    if (!(await this.repository.eventExists(eventId))) throw AppError.notFound("That event");
    return this.repository.eventInteractionSummary(eventId, userId);
  }

  async toggleEventLike(eventId: string, userId: string) {
    const result = await this.repository.likeEvent(eventId, userId);
    if (!result) throw AppError.notFound("That event");
    return { eventId, ...result };
  }

  async unlikeEvent(eventId: string, userId: string) {
    const result = await this.repository.unlikeEvent(eventId, userId);
    if (!result) throw AppError.notFound("That event");
    return { eventId, ...result };
  }

  async listEventLikes(eventId: string, input: PageInput) {
    if (!(await this.repository.eventExists(eventId))) throw AppError.notFound("That event");
    const { items, total } = await this.repository.listEventLikes(eventId, (input.page - 1) * input.limit, input.limit);
    return { items: items.map((item) => ({ id: item.id, userId: item.userId, username: item.user.username, displayName: item.user.displayName, avatarUrl: item.user.avatarUrl, createdAt: item.createdAt.toISOString() })), page: input.page, limit: input.limit, total };
  }

  async createEventComment(eventId: string, userId: string, body: string) {
    const comment = await this.repository.createEventComment(eventId, userId, body.trim());
    if (!comment) throw AppError.notFound("That event");
    return mapEventComment(comment);
  }

  async listEventComments(eventId: string, input: PageInput) {
    if (!(await this.repository.eventExists(eventId))) throw AppError.notFound("That event");
    const { items, total } = await this.repository.listEventComments(eventId, (input.page - 1) * input.limit, input.limit);
    return { items: items.map(mapEventComment), page: input.page, limit: input.limit, total };
  }

  async updateEventComment(id: string, userId: string, body: string) {
    const result = await this.repository.updateEventComment(id, userId, body.trim());
    if (result === "missing") throw AppError.notFound("That comment");
    if (result === "forbidden") throw AppError.forbidden("You can only edit your own comment");
    return mapEventComment(result);
  }

  async deleteEventComment(id: string, userId: string) {
    const result = await this.repository.deleteEventComment(id, userId);
    if (result === "missing") throw AppError.notFound("That comment");
    if (result === "forbidden") throw AppError.forbidden("You can only delete your own comment or moderate comments on your post");
    return { id, deleted: true };
  }

  async createUpcomingEventReminders(now = this.clock.now()): Promise<number> {
    const targetDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    return this.repository.createSavedEventReminders(targetDate);
  }

  async saveEvent(userId: string, eventId: string) {
    if (!(await this.repository.eventExists(eventId))) {
      throw AppError.notFound("That event");
    }
    await this.repository.saveEvent(userId, eventId);
    return { eventId, saved: true };
  }

  async unsaveEvent(userId: string, eventId: string) {
    await this.repository.unsaveEvent(userId, eventId);
    return { eventId, saved: false };
  }

  async listSavedEvents(userId: string, input: PageInput) {
    const { items, total } = await this.repository.listSavedEvents(
      userId,
      (input.page - 1) * input.limit,
      input.limit,
    );
    return {
      items: items.map(toSavedEventResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async saveOrganiser(userId: string, organisationId: string) {
    if (!(await this.repository.organisationExists(organisationId))) {
      throw AppError.notFound("That organiser");
    }
    await this.repository.saveOrganiser(userId, organisationId);
    return { organisationId, saved: true };
  }

  async unsaveOrganiser(userId: string, organisationId: string) {
    await this.repository.unsaveOrganiser(userId, organisationId);
    return { organisationId, saved: false };
  }

  async listSavedOrganisers(userId: string, input: PageInput) {
    const { items, total } = await this.repository.listSavedOrganisers(
      userId,
      (input.page - 1) * input.limit,
      input.limit,
    );
    return {
      items: items.map(toSavedOrganiserResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async createReview(
    userId: string,
    eventId: string,
    input: { rating: number; comment?: string | null | undefined },
  ) {
    assertRating(input.rating);
    if (!(await this.repository.eventExists(eventId))) {
      throw AppError.notFound("That event");
    }
    const existing = await this.repository.findActiveReview(eventId, userId);
    if (existing) {
      throw AppError.conflict(
        ERROR_CODES.VALIDATION_FAILED,
        "You have already reviewed this event",
      );
    }
    const row = await this.repository.createReview({
      eventId,
      userId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    });
    return toReviewResponse(row);
  }

  async updateReview(
    userId: string,
    reviewId: string,
    input: { rating?: number | undefined; comment?: string | null | undefined },
  ) {
    const existing = await this.repository.findReviewById(reviewId);
    if (!existing || existing.deletedAt !== null) {
      throw AppError.notFound("That review");
    }
    if (existing.userId !== userId) {
      throw AppError.forbidden("You can only edit your own review");
    }
    const rating = input.rating ?? existing.rating;
    assertRating(rating);
    const row = await this.repository.updateReview(reviewId, {
      rating,
      comment:
        input.comment === undefined
          ? existing.comment
          : input.comment?.trim() || null,
    });
    return toReviewResponse(row);
  }

  async deleteReview(userId: string, reviewId: string) {
    const existing = await this.repository.findReviewById(reviewId);
    if (!existing || existing.deletedAt !== null) {
      throw AppError.notFound("That review");
    }
    if (existing.userId !== userId) {
      throw AppError.forbidden("You can only delete your own review");
    }
    await this.repository.deleteReview(reviewId);
    return { id: reviewId, deleted: true };
  }

  async listReviews(eventId: string, input: PageInput) {
    if (!(await this.repository.eventExists(eventId))) {
      throw AppError.notFound("That event");
    }
    const { items, total } = await this.repository.listReviews(
      eventId,
      (input.page - 1) * input.limit,
      input.limit,
    );
    return {
      items: items.map(toReviewResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async createEventReport(
    userId: string,
    eventId: string,
    input: { reason: string; details?: string | null | undefined },
  ) {
    if (!(await this.repository.eventExists(eventId))) {
      throw AppError.notFound("That event");
    }
    const row = await this.repository.createEventReport({
      eventId,
      reporterId: userId,
      reason: input.reason.trim(),
      details: input.details?.trim() || null,
    });
    return toEventReportResponse(row);
  }

  async listEventReports(
    input: PageInput & { status?: ModerationStatus | undefined },
  ) {
    const { items, total } = await this.repository.listEventReports({
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      status: input.status,
    });
    return {
      items: items.map(toEventReportResponse),
      page: input.page,
      limit: input.limit,
      total,
    };
  }

  async updateEventReport(
    adminUserId: string,
    reportId: string,
    status: ModerationStatus,
  ) {
    const row = await this.repository.updateEventReportStatus({
      id: reportId,
      status,
      reviewedBy: adminUserId,
      reviewedAt: this.clock.now(),
    });
    if (!row) throw AppError.notFound("That report");
    return toEventReportResponse(row);
  }
}

function mapEventComment(comment: {
  id: string; eventId: string; userId: string; body: string; createdAt: Date;
  user: { id: string; username: string | null; displayName: string | null; avatarUrl: string | null };
}) {
  return { id: comment.id, eventId: comment.eventId, userId: comment.userId, body: comment.body, createdAt: comment.createdAt.toISOString(), user: comment.user };
}

function assertRating(rating: number): void {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw AppError.validation({ rating: ["rating must be between 1 and 5"] });
  }
}
