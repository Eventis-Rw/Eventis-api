import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * One PrismaClient per process.
 *
 * Prisma manages its own connection pool. Keep DATABASE_POOL_MAX modest across
 * API instances and workers — Postgres has a hard connection ceiling. Once there
 * is more than one API instance, put PgBouncer in transaction pooling mode in
 * front rather than raising the pool size.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Drain in-flight queries on shutdown instead of cutting them mid-transaction. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
