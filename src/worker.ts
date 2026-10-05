import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import {
  runtimeName,
  runtimeVersion,
} from "./infrastructure/runtime/runtime.js";


async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();

  const logger = new Logger("worker");
  logger.log(`Eventis worker started — ${runtimeName()} ${runtimeVersion()}`);


}

void bootstrap();
