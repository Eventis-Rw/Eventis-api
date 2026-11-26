import { z } from "zod";
const optionalUrl = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.url().optional(),
);

const optionalString = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().optional(),
);

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "staging", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),

    DATABASE_URL: z.string().startsWith("postgres"),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),

    REDIS_URL: z.string().startsWith("redis"),

    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(3600)
      .default(900),
    JWT_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(3600)
      .max(60 * 60 * 24 * 90)
      .default(60 * 60 * 24 * 30),

    TICKET_SIGNING_PRIVATE_KEY: z.string().min(1),
    TICKET_SIGNING_PUBLIC_KEY: z.string().min(1),
    TICKET_SIGNING_KEY_VERSION: z.coerce.number().int().min(1).default(1),

    STORAGE_ENDPOINT: z.url(),
    STORAGE_BUCKET: z.string().min(1),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    EXPO_ACCESS_TOKEN: optionalString,
    MOBILE_APP_SCHEME: z
      .string()
      .regex(/^[a-z][a-z0-9+.-]*$/i)
      .default("mobile"),

    PAYMENT_PROVIDER: z.enum(["fake", "aggregator", "manual"]).default("fake"),
    PAYMENT_PROVIDER_BASE_URL: optionalUrl,
    PAYMENT_PROVIDER_API_KEY: optionalString,
    PAYMENT_WEBHOOK_SECRET: optionalString,

    /** `fake` for local/tests; `africas_talking` for real SMS via AT. */
    SMS_PROVIDER: z.enum(["fake", "africas_talking"]).default("fake"),
    AT_USERNAME: optionalString,
    AT_API_KEY: optionalString,

    AT_ENV: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? undefined : value,
      z.enum(["sandbox", "production"]).optional(),
    ),
    AT_SENDER_ID: optionalString,
    /** @deprecated Prefer AT_API_KEY. Kept so older .env files still boot. */
    SMS_API_KEY: optionalString,

    /** Optional public STUN hosts and coturn shared-secret credentials for calls. */
    CALL_STUN_URLS: optionalString,
    CALL_TURN_URLS: optionalString,
    CALL_TURN_SHARED_SECRET: optionalString,

    LIVEKIT_URL: z.string().startsWith("wss://").optional(),
    LIVEKIT_API_KEY: optionalString,
    LIVEKIT_API_SECRET: optionalString,
    SENTRY_DSN: optionalString,
    GOOGLE_AUTH_CLIENT_IDS: optionalString,
    APPLE_AUTH_CLIENT_IDS: optionalString,
    AUTH_EMAIL_FROM: optionalString,

    /** `fake` for local/tests (logs instead of sending); `brevo` for real email via Brevo. */
    EMAIL_PROVIDER: z.enum(["fake", "brevo", "disabled"]).default("fake"),
    BREVO_API_KEY: optionalString,
    BREVO_SENDER_EMAIL: optionalString,
    BREVO_SENDER_NAME: optionalString,

    /**
     * DEV ONLY. Marks every FindLove age verification VERIFIED as soon as it is
     * submitted, so the flow can be tested without an admin reviewer.
     */
    FINDLOVE_AGE_AUTO_APPROVE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),

    /**
     * DEV ONLY. Grants an eligible member (age-verified) a default FindLove
     * membership the first time one is needed, instead of requiring a real
     * payment, so discover/connections/chat can be tested end to end.
     */
    FINDLOVE_MEMBERSHIP_AUTO_APPROVE: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
  })
  .refine(
    (e) => !(e.FINDLOVE_AGE_AUTO_APPROVE && e.NODE_ENV === "production"),
    {
      message: "FINDLOVE_AGE_AUTO_APPROVE must not be enabled in production",
      path: ["FINDLOVE_AGE_AUTO_APPROVE"],
    },
  )
  .refine(
    (e) => !(e.FINDLOVE_MEMBERSHIP_AUTO_APPROVE && e.NODE_ENV === "production"),
    {
      message:
        "FINDLOVE_MEMBERSHIP_AUTO_APPROVE must not be enabled in production",
      path: ["FINDLOVE_MEMBERSHIP_AUTO_APPROVE"],
    },
  )

  .refine((e) => e.NODE_ENV !== "production" || e.PAYMENT_PROVIDER !== "fake", {
    message: 'PAYMENT_PROVIDER must not be "fake" in production',
    path: ["PAYMENT_PROVIDER"],
  })
  .refine(
    (e) =>
      e.PAYMENT_PROVIDER !== "aggregator" || Boolean(e.PAYMENT_WEBHOOK_SECRET),
    {
      message:
        "PAYMENT_WEBHOOK_SECRET is required when using a real payment provider",
      path: ["PAYMENT_WEBHOOK_SECRET"],
    },
  )
  .refine(
    (e) =>
      Boolean(e.CLOUDINARY_CLOUD_NAME) === Boolean(e.CLOUDINARY_API_KEY) &&
      Boolean(e.CLOUDINARY_API_KEY) === Boolean(e.CLOUDINARY_API_SECRET),
    {
      message:
        "CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET must be configured together",
      path: ["CLOUDINARY_CLOUD_NAME"],
    },
  )
  .refine((e) => e.NODE_ENV !== "production" || e.SMS_PROVIDER !== "fake", {
    message: 'SMS_PROVIDER must not be "fake" in production',
    path: ["SMS_PROVIDER"],
  })
  .refine(
    (e) => e.SMS_PROVIDER !== "africas_talking" || Boolean(e.AT_USERNAME),
    {
      message: "AT_USERNAME is required when SMS_PROVIDER=africas_talking",
      path: ["AT_USERNAME"],
    },
  )
  .refine(
    (e) =>
      e.SMS_PROVIDER !== "africas_talking" ||
      Boolean(e.AT_API_KEY || e.SMS_API_KEY),
    {
      message: "AT_API_KEY is required when SMS_PROVIDER=africas_talking",
      path: ["AT_API_KEY"],
    },
  )
  .refine((e) => e.NODE_ENV !== "production" || e.EMAIL_PROVIDER !== "fake", {
    message: 'EMAIL_PROVIDER must not be "fake" in production',
    path: ["EMAIL_PROVIDER"],
  })
  .refine((e) => e.EMAIL_PROVIDER !== "brevo" || Boolean(e.BREVO_API_KEY), {
    message: "BREVO_API_KEY is required when EMAIL_PROVIDER=brevo",
    path: ["BREVO_API_KEY"],
  })
  .refine(
    (e) => e.EMAIL_PROVIDER !== "brevo" || Boolean(e.BREVO_SENDER_EMAIL),
    {
      message: "BREVO_SENDER_EMAIL is required when EMAIL_PROVIDER=brevo",
      path: ["BREVO_SENDER_EMAIL"],
    },
  );

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const ENV = Symbol("ENV");
