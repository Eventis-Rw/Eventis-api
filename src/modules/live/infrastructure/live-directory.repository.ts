import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';

import { ENV, type Env } from '../../../config/env.js';
import {
  emptyDirectory,
  type DirectoryState,
} from '../domain/live-directory.js';

const KEY = 'eventis:live:development-directory:v1';
const COMPARE_AND_SET = `local current = redis.call('GET', KEYS[1]) or ''; if current ~= ARGV[1] then return 0 end; redis.call('SET', KEYS[1], ARGV[2], 'EX', 86400); return 1`;
@Injectable()
export class LiveDirectoryRepository implements OnApplicationShutdown {
  private readonly redis: Redis;
  private connecting: Promise<void> | null = null;
  constructor(@Inject(ENV) env: Env) {
    this.redis = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      enableOfflineQueue: false,
    });
    this.redis.on('error', () => {
      /* Failures are returned through request methods; never log connection credentials. */
    });
  }
  private async connect(): Promise<void> {
    if (this.redis.status === 'ready') return;
    this.connecting ??= this.redis.connect().finally(() => {
      this.connecting = null;
    });
    await this.connecting;
  }
  async read(): Promise<DirectoryState> {
    await this.connect();
    const raw = await this.redis.get(KEY);
    return raw ? (JSON.parse(raw) as DirectoryState) : emptyDirectory();
  }
  /** Atomic CAS keeps the five-room limit and FIFO queue correct across API processes. */
  async update<T>(
    change: (state: DirectoryState) => { state: DirectoryState; value: T },
  ): Promise<T> {
    await this.connect();
    for (let attempt = 0; attempt < 20; attempt++) {
      const raw = await this.redis.get(KEY);
      const result = change(
        raw ? (JSON.parse(raw) as DirectoryState) : emptyDirectory(),
      );
      if (
        (await this.redis.eval(
          COMPARE_AND_SET,
          1,
          KEY,
          raw ?? '',
          JSON.stringify(result.state),
        )) === 1
      )
        return result.value;
    }
    throw new Error('Live directory contention');
  }
  onApplicationShutdown(): void {
    this.redis.disconnect();
  }
}
