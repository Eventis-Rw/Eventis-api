import { createHash } from "node:crypto";

import { Injectable } from "@nestjs/common";

import { AppError } from "../../../common/errors/app-error.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

const WINDOW_MS = 15 * 60_000;
function bucketKey(kind: string, value: string): string {
  return `${kind}:${createHash("sha256").update(value).digest("hex")}`;
}
@Injectable()
export class AdminAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async consumeAttempt(email: string, ip: string, now: Date): Promise<void> {
    // Atomic PostgreSQL counters also cover unknown emails and multiple API instances.
    for (const [key, limit] of [
      [bucketKey("ip", ip), 30],
      [bucketKey("email", email), 10],
    ] as const) {
      const expires = new Date(now.getTime() + WINDOW_MS);
      const rows = await this.prisma.$queryRaw<
        { attempts: number; expiresAt: Date }[]
      >`
        INSERT INTO admin_login_rate_limits (key, attempts, expires_at)
        VALUES (${key}, 1, ${expires})
        ON CONFLICT (key) DO UPDATE SET
          attempts = CASE WHEN admin_login_rate_limits.expires_at <= ${now} THEN 1 ELSE admin_login_rate_limits.attempts + 1 END,
          expires_at = CASE WHEN admin_login_rate_limits.expires_at <= ${now} THEN ${expires} ELSE admin_login_rate_limits.expires_at END
        RETURNING attempts, expires_at AS "expiresAt"`;
      const row = rows[0];
      if (!row || row.attempts > limit) {
        throw AppError.rateLimited(
          row
            ? Math.max(
                1,
                Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000),
              )
            : 900,
        );
      }
    }
    await this.prisma.adminLoginRateLimit.deleteMany({
      where: { expiresAt: { lt: now } },
    });
  }
  findCredential(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, role: "ADMIN" },
      select: {
        id: true,
        role: true,
        status: true,
        deletedAt: true,
        adminPasswordHash: true,
      },
    });
  }
  async clearEmailAttempts(email: string): Promise<void> {
    await this.prisma.adminLoginRateLimit.deleteMany({
      where: { key: bucketKey("email", email) },
    });
  }
}
