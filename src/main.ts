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
  const installKey='eventis-install-id';
  const credentialKey='eventis-device-credential';
  let deviceId=localStorage.getItem(installKey);
  if(!deviceId){
    deviceId='evt-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
    localStorage.setItem(installKey,deviceId);
  }
  let storedCredential=localStorage.getItem(credentialKey)||sessionStorage.getItem(credentialKey)||'';
  if(storedCredential===deviceId){
    localStorage.removeItem(credentialKey);
    sessionStorage.removeItem(credentialKey);
    storedCredential='';
  }
  if(storedCredential){
    localStorage.setItem(credentialKey,storedCredential);
    sessionStorage.removeItem(credentialKey);
  }
  const authPaths=['/api/v1/auth/signup','/api/v1/auth/signup/send-otp','/api/v1/auth/signup/verify-otp','/api/v1/auth/login'];
  const credentialPaths=['/api/v1/auth/login'];
  const saveCredential=(value)=>{
    if(typeof value==='string'&&value.length>=32&&value!==deviceId){
      localStorage.setItem(credentialKey,value);
      storedCredential=value;
      return true;
    }
    return false;
  };
  const applyCredentialDefaults=()=>{
    for(const path of authPaths){
      const operation=spec.paths[path]?.post;
      if(!operation) continue;
      operation.parameters=operation.parameters||[];
      const deviceHeader=operation.parameters.find((parameter)=>parameter.name==='X-Device-Id');
      if(deviceHeader){
        deviceHeader.schema=deviceHeader.schema||{};
        deviceHeader.schema.default=deviceId;
        deviceHeader.example=deviceId;
      }
      const credentialHeader=operation.parameters.find((parameter)=>parameter.name==='X-Device-Credential');
      if(credentialHeader){
        credentialHeader.schema=credentialHeader.schema||{};
        if(storedCredential){
          credentialHeader.schema.default=storedCredential;
          credentialHeader.example=storedCredential;
        } else {
          delete credentialHeader.schema.default;
          credentialHeader.example='<paste-deviceCredential-from-signup-not-install-id>';
        }
      }
    }
  };
  const headerValue=(headers,name)=>{
    if(!headers) return undefined;
    const found=Object.keys(headers).find((key)=>key.toLowerCase()===name.toLowerCase());
    return found?headers[found]:undefined;
  };
  const spec=await(await fetch('/openapi.json')).json();
  applyCredentialDefaults();
  window.ui=SwaggerUIBundle({
    spec,
    dom_id:'#swagger-ui',
    deepLinking:true,
    displayRequestDuration:true,
    persistAuthorization:true,
    filter:true,
    requestInterceptor:(request)=>{
      if(!request.url||!request.url.includes('/api/v1/auth/')) return request;
      request.headers=request.headers||{};
      request.headers['X-Device-Id']=deviceId;
      if(credentialPaths.some((path)=>request.url.includes(path))){
        const fromForm=headerValue(request.headers,'X-Device-Credential');
        if(fromForm&&fromForm!==deviceId) saveCredential(fromForm);
        const credential=localStorage.getItem(credentialKey);
        if(!credential||credential===deviceId){
          window.alert('X-Device-Credential must be the deviceCredential from signup/verify-otp — not X-Device-Id.');
          throw new Error('Missing deviceCredential');
        }
        request.headers['X-Device-Credential']=credential;
      }
      return request;
    },
    responseInterceptor:(response)=>{
      if(!response.url||!(response.url.includes('/api/v1/auth/signup/verify-otp')||response.url.includes('/api/v1/auth/verify-otp'))||!response.body){
        return response;
      }
      try{
        const data=typeof response.body==='string'?JSON.parse(response.body):response.body;
        if(data&&typeof data.deviceCredential==='string'&&saveCredential(data.deviceCredential)){
          applyCredentialDefaults();
        }
      }catch{}
      return response;
    }
  });
})();</script></body></html>`;
}
