import { z } from 'zod';

/**
 * Every environment variable the API reads, validated once at boot.
 *
 * The process refuses to start on a bad value rather than failing at 03:00 on the
 * first request that happens to need it. A missing payment secret is a startup
 * error, not a mystery 500 three hours into a deploy.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

    DATABASE_URL: z.string().startsWith('postgres'),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    REDIS_URL: z.string().startsWith('redis'),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),

    TICKET_SIGNING_PRIVATE_KEY: z.string().min(1),
    TICKET_SIGNING_PUBLIC_KEY: z.string().min(1),
    TICKET_SIGNING_KEY_VERSION: z.coerce.number().int().min(1).default(1),

    STORAGE_ENDPOINT: z.url(),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),

    PAYMENT_PROVIDER: z.enum(['fake', 'aggregator']).default('fake'),
    PAYMENT_PROVIDER_BASE_URL: z.url().optional(),
    PAYMENT_PROVIDER_API_KEY: z.string().optional(),
    PAYMENT_WEBHOOK_SECRET: z.string().optional(),

    SMS_PROVIDER: z.enum(['fake', 'gateway']).default('fake'),
    SMS_API_KEY: z.string().optional(),

    SENTRY_DSN: z.string().optional(),
  })
  /**
   * Nobody ships to production pointing at the fake payment provider, and nobody
   * ships a real provider without the secret needed to verify its webhooks. An
   * unverified webhook endpoint is an open door to free tickets.
   */
  .refine((e) => e.NODE_ENV !== 'production' || e.PAYMENT_PROVIDER !== 'fake', {
    message: 'PAYMENT_PROVIDER must not be "fake" in production',
    path: ['PAYMENT_PROVIDER'],
  })
  .refine((e) => e.PAYMENT_PROVIDER !== 'aggregator' || Boolean(e.PAYMENT_WEBHOOK_SECRET), {
    message: 'PAYMENT_WEBHOOK_SECRET is required when using a real payment provider',
    path: ['PAYMENT_WEBHOOK_SECRET'],
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.SMS_PROVIDER !== 'fake', {
    message: 'SMS_PROVIDER must not be "fake" in production',
    path: ['SMS_PROVIDER'],
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    // Print the field names and messages, never the values — this output reaches logs.
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
