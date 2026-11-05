import { describe, expect, it } from 'bun:test';

import type { Clock } from '../../../common/clock.js';
import type { Env } from '../../../config/env.js';
import type { LiveDirectoryRepository } from '../infrastructure/live-directory.repository.js';

import { LiveService } from './live.service.js';

describe('Live development access boundary', () => {
  for (const [mode, enabled] of [
    ['production', true],
    ['staging', true],
    ['development', false],
  ] as const) {
    it(`refuses ${mode} with development flag ${enabled} before directory I/O`, async () => {
      let reads = 0;
      const repository = {
        read: () => {
          reads++;
          throw Error('Should not access storage');
        },
      } as unknown as LiveDirectoryRepository;
      const service = new LiveService(
        repository,
        {} as Clock,
        {
          NODE_ENV: mode,
          LIVE_DEVELOPMENT_ACCESS: enabled,
          JWT_ACCESS_SECRET: 'test'.repeat(8),
        } as Env,
      );
      const denied = (error: unknown) => {
        expect(
          error instanceof Error &&
            error.message.includes('Live testing is unavailable'),
        ).toBe(true);
      };
      const allowed = () => {
        throw new Error('Live unexpectedly enabled');
      };
      await service.list().then(allowed, denied);
      await service
        .start({
          requestId: 'testingoperation12345',
          host: { id: 'user', name: 'User' },
          title: 'Live',
          mode: 'voice',
          chatEnabled: true,
        })
        .then(allowed, denied);
      expect(reads).toBe(0);
    });
  }
});
