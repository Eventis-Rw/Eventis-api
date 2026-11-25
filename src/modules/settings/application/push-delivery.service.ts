import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../../../infrastructure/database/prisma.service.js";

type Delivery = {
  id: string; token: string; user_id: string; title: string; body: string;
  data: Record<string, unknown>; ticket: string | null; attempts: number;
};
type Result = { status: "ok" | "error"; id?: string; details?: { error?: string } };

@Injectable()
export class PushDeliveryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushDeliveryService.name);
  private timer?: ReturnType<typeof setInterval>;
  private pending?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      if (this.pending) return;
      this.pending = this.deliver().catch(() => {
        this.logger.warn("Push delivery is temporarily unavailable");
      }).finally(() => { delete this.pending; });
    }, 5000);
    this.timer.unref();
  }

  async onModuleDestroy() {
    clearInterval(this.timer);
    await this.pending;
  }

  async deliver() {
    const rows = await this.prisma.$queryRaw<Delivery[]>`
      WITH due AS (
        SELECT id FROM push_deliveries WHERE next_attempt <= now()
        ORDER BY next_attempt LIMIT 100 FOR UPDATE SKIP LOCKED
      )
      UPDATE push_deliveries d SET next_attempt = now() + interval '2 minutes', attempts = attempts + 1
      FROM due, push_tokens t
      WHERE d.id = due.id AND t.id = d.token_id AND t.user_id = d.user_id
      RETURNING d.id, t.token, d.user_id, d.title, d.body, d.data, d.ticket, d.attempts`;

    if (!rows.length) return;
    for (const receipt of [false, true]) {
      const batch = rows.filter(row => Boolean(row.ticket) === receipt);
      if (!batch.length) continue;
      try {
        const endpoint = receipt ? "getReceipts" : "send";
        const payload = receipt ? { ids: batch.map(row => row.ticket) } : batch.map(row => ({
          to: row.token, title: row.title, body: row.body, data: row.data,
          channelId: "eventis", priority: "high", sound: "default", ttl: 3600,
        }));
        const response = await fetch(`https://exp.host/--/api/v2/push/${endpoint}`, {
          method: "POST", headers: {
            "Content-Type": "application/json",
            ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
          }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new Error("Push gateway unavailable");
        const { data } = await response.json() as { data?: Record<string, Result> };
        for (const [i, row] of batch.entries()) {
          const result = data?.[row.ticket ?? String(i)];
          if (result?.status === "ok" && !receipt && result.id) {
            await this.prisma.$executeRaw`UPDATE push_deliveries SET ticket = ${result.id},
              attempts = 0, next_attempt = now() + interval '15 minutes' WHERE id = ${row.id}::uuid`;
          } else if (receipt && result?.status === "ok") {
            await this.remove(row);
          } else if (result?.details?.error === "DeviceNotRegistered") {
            await this.prisma.pushToken.deleteMany({ where: { token: row.token, userId: row.user_id } });
          } else if (result?.status === "error" && result.details?.error !== "MessageRateExceeded") {
            this.logger.warn(`Push rejected: ${result.details?.error ?? "unknown error"}`);
            await this.remove(row);
          } else {
            await this.retry([row]);
          }
        }
      } catch {
        this.logger.warn("Could not finish the push delivery batch");
        await this.retry(batch);
      }
    }
  }

  private remove(row: Delivery) {
    return this.prisma.$executeRaw`DELETE FROM push_deliveries WHERE id = ${row.id}::uuid`;
  }

  private async retry(rows: Delivery[]) {
    const ids = Prisma.join(rows.map(row => Prisma.sql`${row.id}::uuid`));
    await this.prisma.$executeRaw`DELETE FROM push_deliveries WHERE id IN (${ids})
      AND (attempts >= 10 OR created_at < now() - interval '1 day')`;
    await this.prisma.$executeRaw`UPDATE push_deliveries SET next_attempt = now() +
      least(3600, 15 * power(2, least(attempts, 8))) * interval '1 second'
      WHERE id IN (${ids}) AND next_attempt <= now() + interval '2 minutes'`;
  }
}
