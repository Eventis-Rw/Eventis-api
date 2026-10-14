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
  assertSupportedRuntime,
  runtimeName,
  runtimeVersion,
} from "./infrastructure/runtime/runtime.js";
import { openApiDocument } from "./openapi.js";

async function bootstrap(): Promise<void> {
  assertSupportedRuntime();

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

  const fastify = app.getHttpAdapter().getInstance();
  fastify.get("/openapi.json", (_request, reply) =>
    reply.send(openApiDocument),
  );
  fastify.get("/docs", (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(swaggerUiHtml()),
  );

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
  new Logger("bootstrap").log(
    `Swagger UI: http://localhost:${env.PORT}/docs | OpenAPI: http://localhost:${env.PORT}/openapi.json`,
  );
}

void bootstrap();

function swaggerUiHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eventis API — Swagger UI</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>(async()=>{
  const spec=await(await fetch('/openapi.json')).json();
  window.ui=SwaggerUIBundle({
    spec,
    dom_id:'#swagger-ui',
    deepLinking:true,
    displayRequestDuration:true,
    persistAuthorization:true,
    filter:true
  });
})();</script></body></html>`;
}
