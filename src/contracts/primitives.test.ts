import { describe, expect, it } from 'bun:test';

import { maskPhone, phoneE164, rwandaPhone, slug } from './primitives.js';

describe('phoneE164', () => {
  it('accepts a Rwandan mobile number', () => {
    expect(phoneE164.parse('+250788123456')).toBe('+250788123456');
  });

  it('rejects a local-format number, which must be normalized first', () => {
    expect(() => phoneE164.parse('0788123456')).toThrow();
  });

  it('rejects a number with spaces', () => {
    expect(() => phoneE164.parse('+250 788 123 456')).toThrow();
  });

  it('constrains rwandaPhone to +250', () => {
    expect(() => rwandaPhone.parse('+254712345678')).toThrow();
  });
});

describe('maskPhone', () => {
  it('leaves neither the subscriber prefix nor the full tail readable', () => {
    expect(maskPhone('+250788123456')).toBe('+2507****456');
  });
});

describe('slug', () => {
  it('accepts a hyphenated lowercase slug', () => {
    expect(slug.parse('kigali-jazz-night-2026')).toBe('kigali-jazz-night-2026');
  });

  it('rejects uppercase and double hyphens', () => {
    expect(() => slug.parse('Kigali-Jazz')).toThrow();
    expect(() => slug.parse('kigali--jazz')).toThrow();
  });
});
