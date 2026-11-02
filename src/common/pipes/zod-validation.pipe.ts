import type { PipeTransform } from '@nestjs/common';
import { type z } from 'zod';

import { AppError } from '../errors/app-error.js';

/**
 * Validates with a schema from @eventis/contracts and returns the parsed, typed value.
 *
 * This is the only way a request body or query enters a controller. Trusting the
 * shape of unvalidated input is how an unbounded string reaches a varchar column
 * and how a negative quantity reaches inventory.
 */
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      (fields[key] ??= []).push(issue.message);
    }
    throw AppError.validation(fields);
  }
}

/** `@Body(zodBody(createOrderRequest)) body: CreateOrderRequest` */
export function zodPipe<T extends z.ZodType>(schema: T): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
