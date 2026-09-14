import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { runtimeName, runtimeVersion } from './infra/runtime/runtime.js';

/**
 * Background workers: the outbox poller, notification delivery, payment
 * reconciliation, hold expiry and settlement.
 *
 * Same image as the API, different command. Workers run in their own process so a
 * slow reconciliation job cannot consume the request path's event loop, and so they
 * can be scaled independently.
 *
 * Queue consumers are registered by their owning modules. Every consumer must be
 * idempotent — outbox delivery is at-least-once and the same job WILL arrive twice.
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();

  const logger = new Logger('worker');
  logger.log(`Eventis worker started — ${runtimeName()} ${runtimeVersion()}`);

  // Queue processors are registered here as modules gain them (Sprint 3 onwards).
}

void bootstrap();
