import { describe, expect, it } from 'bun:test';
import { z } from 'zod';

import { AppError } from '../errors/app-error.js';

import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({
  quantity: z.number().int().min(1).max(20),
  note: z.string().max(10).optional(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value on valid input', () => {
    expect(pipe.transform({ quantity: 2 })).toEqual({ quantity: 2 });
  });

  it('throws a 422 AppError rather than leaking a Zod error', () => {
    expect(() => pipe.transform({ quantity: 0 })).toThrow(AppError);
    try {
      pipe.transform({ quantity: 0 });
    } catch (e) {
      expect((e as AppError).status).toBe(422);
      expect((e as AppError).code).toBe('VALIDATION_FAILED');
    }
  });

  it('groups every issue by field so a form can show them all at once', () => {
    try {
      pipe.transform({ quantity: 99, note: 'far too long to fit' });
    } catch (e) {
      const fields = (e as AppError).options.fields;
      expect(Object.keys(fields ?? {}).sort()).toEqual(['note', 'quantity']);
    }
  });

  it('rejects a missing body instead of treating it as empty', () => {
    expect(() => pipe.transform(undefined)).toThrow(AppError);
  });
});
