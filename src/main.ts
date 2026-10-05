import "reflect-metadata";

import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import { REQUEST_ID_HEADER } from "@eventis/contracts";
import { Logger, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Logger as PinoLogger } from "nestjs-pino";

import { AppModule } from "./app.module.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { ENV, type Env } from "./config/env.js";
import {
  runtimeName,
  runtimeVersion,
} from "./infrastructure/runtime/runtime.js";

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    genReqId: (req: IncomingMessage) =>
      (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID(),
    bodyLimit: 6 * 1024 * 1024,
  });

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    adapter,
    {
      bufferLogs: true,
    },
  );

  app.useLogger(app.get(PinoLogger));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api", { exclude: ["healthz", "readyz"] });

  await app.register(import("@fastify/helmet"), {
    contentSecurityPolicy: false,
  });

  await app.register(import("@fastify/multipart"), {
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
    },
  });


  app.enableShutdownHooks();

  const env = app.get<Env>(ENV);
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  new Logger("bootstrap").log(
    `Eventis API listening on :${env.PORT} — ${runtimeName()} ${runtimeVersion()}, env ${env.NODE_ENV}`,
  );
}

void bootstrap();
