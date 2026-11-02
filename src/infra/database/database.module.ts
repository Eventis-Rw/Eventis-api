import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { ENV, type Env } from '../../config/env.js';

import * as schema from './schema/index.js';

export const DB = Symbol('DB');
export const PG = Symbol('PG');

export type Database = PostgresJsDatabase<typeof schema>;

/**
 * One database connection pool per process.
 *
 * `max` is deliberately small and comes from configuration. Postgres has a hard
 * connection ceiling; the default of 10 per instance times N instances plus N
 * workers is how you exhaust it during a deploy, when old and new instances
 * overlap. Once there is more than one API instance, put PgBouncer in transaction
 * pooling mode in front rather than raising this number.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG,
      inject: [ENV],
      useFactory: (env: Env) =>
        postgres(env.DATABASE_URL, {
          max: env.DATABASE_POOL_MAX,
          idle_timeout: 20,
          connect_timeout: 10,
          // bigint columns come back as strings; money must never round-trip a float
          types: {
            bigint: postgres.BigInt,
          },
          onnotice: () => undefined,
        }),
    },
    {
      provide: DB,
      inject: [PG],
      useFactory: (sql: postgres.Sql): Database => drizzle(sql, { schema }),
    },
  ],
  exports: [DB, PG],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG) private readonly sql: postgres.Sql) {}

  /** Drain in-flight queries on shutdown instead of cutting them mid-transaction. */
  async onApplicationShutdown(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}
