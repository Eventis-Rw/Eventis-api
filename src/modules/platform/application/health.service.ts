import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';

import { Clock } from '../../../common/clock.js';
import { DB, type Database } from '../../../infra/database/database.module.js';

export interface ReadinessReport {
  status: 'ok' | 'degraded';
  checks: Record<string, { ok: boolean; latencyMs: number; error?: string }>;
  checkedAt: string;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async readiness(): Promise<ReadinessReport> {
    const checks: ReadinessReport['checks'] = {};

    const started = this.clock.nowMs();
    try {
      await this.db.execute(sql`SELECT 1`);
      checks.database = { ok: true, latencyMs: this.clock.nowMs() - started };
    } catch (error) {
      checks.database = {
        ok: false,
        latencyMs: this.clock.nowMs() - started,
        // The message, not the connection string. This endpoint is reachable.
        error: error instanceof Error ? error.name : 'unknown',
      };
    }

    const ok = Object.values(checks).every((c) => c.ok);
    return {
      status: ok ? 'ok' : 'degraded',
      checks,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
