import type { IncomingMessage } from "node:http";

import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";

import { ConfigModule } from "./config/config.module.js";
import { ENV, type Env } from "./config/env.js";
import { PrismaModule } from "./infrastructure/database/prisma.module.js";
import { StorageModule } from "./infrastructure/storage/storage.module.js";
import { EventsModule } from "./modules/events/index.js";
import { PlatformModule } from "./modules/platform/index.js";


@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,

          ...(env.NODE_ENV === "development"
            ? { transport: { target: "pino-pretty" } }
            : {}),

          redact: {
            paths: [
              "req.headers.authorization",
              "req.headers.cookie",
              'req.headers["idempotency-key"]',
              "req.body.phone",
              "req.body.code",
              "req.body.payerPhone",
              "req.body.refreshToken",
              'res.headers["set-cookie"]',
            ],
            censor: "[redacted]",
          },
          customProps: (req: IncomingMessage & { id?: string }) => ({
            requestId: req.id,
          }),
       
          autoLogging: {
            ignore: (req: IncomingMessage) => req.url === "/healthz",
          },
        },
      }),
    }),
    PrismaModule,
    StorageModule,
    PlatformModule,
    EventsModule,
  ],
})
export class AppModule {}
