import { Global, Module } from '@nestjs/common';

import { ENV, loadEnv, type Env } from './env.js';

/**
 * Config is global because everything needs it and threading it through every
 * module's imports buys nothing. It is the ONLY global module.
 */
@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv() }],
  exports: [ENV],
})
export class ConfigModule {}
