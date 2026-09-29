import { Injectable } from "@nestjs/common";

import { Clock } from "../../../common/clock.js";
import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

export interface ReadinessReport {
  status: "ok" | "degraded";
  checks: Record<string, { ok: boolean; latencyMs: number; error?: string }>;
  checkedAt: string;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const checks: ReadinessReport["checks"] = {};

    const started = this.clock.nowMs();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { ok: true, latencyMs: this.clock.nowMs() - started };
    } catch (error) {
      checks.database = {
        ok: false,
        latencyMs: this.clock.nowMs() - started,
        // The message, not the connection string. This endpoint is reachable.
        error: error instanceof Error ? error.name : "unknown",
      };
    }

    const ok = Object.values(checks).every((c) => c.ok);
    return {
      status: ok ? "ok" : "degraded",
      checks,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
