import { z } from "zod";

import { EVENT_STATUSES } from "../../domain/event.js";

const dateSchema = z.preprocess((val) => {
  if (typeof val === "string" || val instanceof Date) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return val;
}, z.date({ message: "date must be a valid date" }));

const nullableDateSchema = z.preprocess(
  (val) => (val === "" || val === undefined ? null : val),
  dateSchema.nullable(),
);

const optionalNumber = (min: number, max: number) =>
  z.preprocess(
    (val) => (val === "" || val === undefined ? undefined : val),
    z.coerce.number().min(min).max(max).nullable().optional(),
  );

const optionalInteger = (min: number, max: number) =>
  z.preprocess(
    (val) => (val === "" || val === undefined ? undefined : val),
    z.coerce.number().int().min(min).max(max).nullable().optional(),
  );

const booleanSchema = z.preprocess(
  (val) =>
    val === "true" || val === "1"
      ? true
      : val === "false" || val === "0"
        ? false
        : val,
  z.boolean(),
);

const bigintSchema = z
  .union([
    z.bigint(),
    z.number().int().nonnegative(),
    z.string().regex(/^\d+$/, "price_minor must be a positive integer"),
  ])
  .transform((value) => BigInt(value));

const optionalBigint = z.preprocess(
  (val) => (val === "" || val === undefined ? undefined : val),
  bigintSchema.nullable().optional(),
);

const tagsSchema = z.preprocess(
  (val) =>
    typeof val === "string"
      ? val
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : val,
  z.array(z.string().trim().min(1).max(40)).max(20),
);

const nullableUuid = z.string().uuid().nullable().optional();
const nullableText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

export const createEventDto = z
  .object({
    title: z
      .string()
      .trim()
      .min(4, "title must be at least 4 characters")
      .max(160, "title cannot exceed 160 characters"),
    description: nullableText(10_000),
    category: nullableText(60),
    category_id: nullableUuid,
    location: z
      .string()
      .trim()
      .min(2, "location must be at least 2 characters")
      .max(255, "location cannot exceed 255 characters"),
    city: nullableText(120),
    latitude: optionalNumber(-90, 90),
    longitude: optionalNumber(-180, 180),
    start_date: dateSchema,
    time: z
      .string()
      .trim()
      .regex(
        /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/,
        "time must be in HH:mm format (e.g. 18:00)",
      ),
    end_date: nullableDateSchema.optional(),
    end_time: z
      .string()
      .trim()
      .regex(
        /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/,
        "end_time must be in HH:mm format (e.g. 20:00)",
      )
      .nullable()
      .optional(),
    timezone: z.string().trim().min(1).max(40).optional().default("Africa/Kigali"),
    status: z.enum(EVENT_STATUSES).optional().default("draft"),
    capacity: optionalInteger(1, 1_000_000),
    is_paid: booleanSchema.optional().default(false),
    price_minor: optionalBigint,
    currency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "currency must be a 3-letter code")
      .transform((value) => value.toUpperCase())
      .optional()
      .default("RWF"),
    booking_url: z.string().trim().url().max(500).nullable().optional(),
    instructions: nullableText(10_000),
    tags: tagsSchema.optional().default([]),
    organisation_id: nullableUuid,
  })
  .refine((value) => !value.is_paid || value.price_minor !== null, {
    message: "price_minor is required for paid events",
    path: ["price_minor"],
  })
  .refine(
    (value) =>
      !value.end_date || value.end_date.getTime() >= value.start_date.getTime(),
    {
      message: "end_date cannot be before start_date",
      path: ["end_date"],
    },
  );

export type CreateEventDto = z.infer<typeof createEventDto>;
