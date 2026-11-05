import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Post,
} from '@nestjs/common';

import { AppError } from '../../../common/errors/app-error.js';
import { zodPipe } from '../../../common/pipes/zod-validation.pipe.js';
import {
  liveHeartbeatRequest,
  startLiveRequest,
  type LiveHeartbeatRequest,
  type StartLiveRequest,
} from '../../../contracts/index.js';
import { LiveService } from '../application/live.service.js';

function bearer(value?: string): string {
  if (!value?.startsWith('Bearer ') || value.length !== 71)
    throw AppError.unauthenticated(
      'This device no longer owns the Live session.',
    );
  return value.slice(7);
}
@Controller({ path: 'live', version: '1' })
export class LiveController {
  constructor(@Inject(LiveService) private readonly live: LiveService) {}
  @Get('rooms') list() {
    return this.live.list();
  }
  @Post('rooms') start(
    @Body(zodPipe(startLiveRequest)) body: StartLiveRequest,
  ) {
    return this.live.start(body);
  }
  @Post('rooms/:id/watch') watch(@Param('id') id: string) {
    return this.live.watch(id);
  }
  @Post('rooms/:id/heartbeat') heartbeat(
    @Param('id') id: string,
    @Headers('authorization') token: string | undefined,
    @Body(zodPipe(liveHeartbeatRequest)) body: LiveHeartbeatRequest,
  ) {
    return this.live.heartbeat(id, bearer(token), body);
  }
  @Delete('rooms/:id') end(
    @Param('id') id: string,
    @Headers('authorization') token: string | undefined,
  ) {
    return this.live.end(id, bearer(token));
  }
  @Post('queue/:id/poll') queue(
    @Param('id') id: string,
    @Headers('authorization') token: string | undefined,
  ) {
    return this.live.queue(id, bearer(token), 'poll');
  }
  @Post('queue/:id/claim') claim(
    @Param('id') id: string,
    @Headers('authorization') token: string | undefined,
  ) {
    return this.live.queue(id, bearer(token), 'claim');
  }
  @Delete('queue/:id') cancel(
    @Param('id') id: string,
    @Headers('authorization') token: string | undefined,
  ) {
    return this.live.queue(id, bearer(token), 'cancel');
  }
}
