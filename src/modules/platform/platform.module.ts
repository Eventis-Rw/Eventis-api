import { Module } from '@nestjs/common';

import { Clock, SystemClock } from '../../common/clock.js';

import { HealthController } from './api/health.controller.js';
import { HealthService } from './application/health.service.js';

/**
 * Cross-cutting plumbing every other module depends on: the clock, health probes,
 * and later the outbox, idempotency and audit log.
 *
 * This is the one module others may depend on freely.
 */
@Module({
  controllers: [HealthController],
  providers: [HealthService, { provide: Clock, useClass: SystemClock }],
  exports: [Clock],
})
export class PlatformModule {}
