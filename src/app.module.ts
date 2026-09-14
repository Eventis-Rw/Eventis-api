import type { IncomingMessage } from 'node:http';

import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';

import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { CatalogModule } from './modules/catalog/index.js';
import { PlatformModule } from './modules/platform/index.js';

/**
 * The modular monolith. One deployable, one database, clear internal boundaries.
 *
 * Adding a module here is the last step, not the first — see
 * docs/guides/adding-a-module.md.
 */
@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Pretty output locally; raw JSON everywhere else, because log shippers parse JSON.
          // Spread rather than assign undefined — exactOptionalPropertyTypes means an
          // explicit undefined is not the same as an absent key.
          ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
          /**
           * Never log a full phone number, an OTP, a token, or a password. Redaction
           * here is the backstop; not putting them in the log line is the control.
           */
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'req.headers["idempotency-key"]',
              'req.body.phone',
              'req.body.code',
              'req.body.payerPhone',
              'req.body.refreshToken',
              'res.headers["set-cookie"]',
            ],
            censor: '[redacted]',
          },
          customProps: (req: IncomingMessage & { id?: string }) => ({ requestId: req.id }),
          // The liveness probe fires every few seconds. Logging it buries everything else.
          autoLogging: { ignore: (req: IncomingMessage) => req.url === '/healthz' },
        },
      }),
    }),
    DatabaseModule,
    PlatformModule,
    CatalogModule,
  ],
})
export class AppModule {}
