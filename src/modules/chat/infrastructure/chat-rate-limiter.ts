import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { evaluateRateLimit } from "../domain/chat.js";

@Injectable()
export class ChatRateLimiter {
  private readonly buckets = new Map<string, number[]>();

  consume(key: string, now: Date, max: number, windowMs: number): void {
    const current = this.buckets.get(key) ?? [];
    const result = evaluateRateLimit(current, now.getTime(), max, windowMs);
    this.buckets.set(key, result.next);
    if (result.limited) {
      throw AppError.rateLimited(result.retryAfterSeconds);
    }
  }
}
