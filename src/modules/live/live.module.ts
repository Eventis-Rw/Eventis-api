import { Module } from '@nestjs/common';

import { Clock, SystemClock } from '../../common/clock.js';

import { LiveController } from './api/live.controller.js';
import { LiveService } from './application/live.service.js';
import { LiveDirectoryRepository } from './infrastructure/live-directory.repository.js';
@Module({
  controllers: [LiveController],
  providers: [
    LiveService,
    LiveDirectoryRepository,
    { provide: Clock, useClass: SystemClock },
  ],
})
export class LiveModule {}
