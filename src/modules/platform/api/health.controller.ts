import { Controller, Get } from '@nestjs/common';

import { HealthService } from '../application/health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness. Answers "is this process running". Deliberately checks nothing else —
   * a liveness probe that touches the database restarts a healthy API during a
   * database blip, turning a partial outage into a total one.
   */
  @Get('/healthz')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness. Answers "can this process serve traffic", so it does check dependencies. */
  @Get('/readyz')
  async ready() {
    return this.health.readiness();
  }
}
