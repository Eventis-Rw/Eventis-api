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
import { openApiDocument } from "./openapi.js";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter.js";
import { ENV, type Env } from "./config/env.js";
import {
  runtimeName,
  runtimeVersion,
} from "./infrastructure/runtime/runtime.js";

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({
    trustProxy: true,
    /**
     * One id follows a request through every log line, into the error envelope the
     * client sees, and into Sentry. When a user quotes a reference, it resolves to
     * exactly one request.
     */
    genReqId: (req: IncomingMessage) =>
      (req.headers[REQUEST_ID_HEADER] as string | undefined) ?? randomUUID(),
    bodyLimit: 1_048_576,
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

  /**
   * URI versioning. Old mobile builds keep calling /v1 forever, so the version must
   * be visible in the path rather than negotiated in a header nobody sets.
   */
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });
  app.setGlobalPrefix("api", { exclude: ["healthz", "readyz"] });

  // Keep the interactive reference and downloadable spec available in every env.
  // Health probes stay outside the prefix; documentation is hosted at /docs.
  const fastify = app.getHttpAdapter().getInstance();
  fastify.get("/openapi.json", (_request, reply) => reply.send(openApiDocument));
  fastify.get("/docs", (_request, reply) => reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Eventis API — Swagger UI</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"></head>
<body><div id="swagger-ui"></div><script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script><script>(async()=>{let deviceId=localStorage.getItem('eventis-install-id');if(!deviceId){deviceId='evt-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));localStorage.setItem('eventis-install-id',deviceId);}const credentialKey='eventis-device-credential';const spec=await(await fetch('/openapi.json')).json();for(const path of ['/api/v1/auth/signup','/api/v1/auth/signup/send-otp','/api/v1/auth/signup/verify-otp','/api/v1/auth/login']){const operation=spec.paths[path]?.post;if(operation){operation.parameters=operation.parameters||[];const header=operation.parameters.find((parameter)=>parameter.name==='X-Device-Id');if(header){header.schema.default=deviceId;header.example=deviceId;}}}window.ui=SwaggerUIBundle({spec,dom_id:'#swagger-ui',deepLinking:true,displayRequestDuration:true,persistAuthorization:true,filter:true,requestInterceptor:(request)=>{if(request.url&&request.url.includes('/api/v1/auth/')){request.headers=request.headers||{};request.headers['X-Device-Id']=deviceId;if(request.url.includes('/api/v1/auth/login')||request.url.includes('/api/v1/auth/signup/verify-otp')||request.url.includes('/api/v1/auth/verify-otp')){const credential=sessionStorage.getItem(credentialKey);if(credential)request.headers['X-Device-Credential']=credential;}}return request;},responseInterceptor:(response)=>{if(response.url&&(response.url.includes('/api/v1/auth/signup/verify-otp')||response.url.includes('/api/v1/auth/verify-otp'))&&response.body){try{const data=typeof response.body==='string'?JSON.parse(response.body):response.body;if(data&&typeof data.deviceCredential==='string')sessionStorage.setItem(credentialKey,data.deviceCredential);}catch{}}return response;}});})();</script></body></html>`));

  await app.register(import("@fastify/helmet"), {
    contentSecurityPolicy: false,
  });

  /** Finish in-flight requests before exiting instead of dropping them mid-payment. */
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
