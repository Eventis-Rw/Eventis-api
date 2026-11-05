import { describe, expect, it } from 'bun:test';

import { formatMinor, isFree, money, moneyNonNegative, toWire } from './money.js';

describe('formatMinor', () => {
  it('treats RWF as a zero-exponent currency', () => {
    // 1000 minor units of RWF is 1,000 francs, NOT 10.00.
    expect(formatMinor(1000n, 'RWF', { withSymbol: false })).toBe('1,000');
  });

  it('formats zero', () => {
    expect(formatMinor(0n, 'RWF', { withSymbol: false })).toBe('0');
  });

  it('formats negative amounts with the sign outside the digits', () => {
    expect(formatMinor(-2500n, 'RWF', { withSymbol: false })).toBe('-2,500');
  });

  it('appends the symbol by default', () => {
    expect(formatMinor(5000n)).toBe('5,000 FRw');
  });

  it('survives values beyond Number.MAX_SAFE_INTEGER', () => {
    const huge = 9_007_199_254_740_993n; // 2^53 + 1
    expect(formatMinor(huge, 'RWF', { withSymbol: false })).toBe('9,007,199,254,740,993');
  });
});

describe('money parsing', () => {
  it('parses an integer string into a bigint', () => {
    expect(money.parse('12000')).toBe(12000n);
  });

  it('rejects floats, because money is never a float', () => {
    expect(() => money.parse('12.50')).toThrow();
  });

  it('rejects a JS number', () => {
    expect(() => money.parse(12000)).toThrow();
  });

  it('rejects leading zeros, so one amount has one representation', () => {
    expect(() => money.parse('0012')).toThrow();
  });

  it('rejects a negative price where a negative price is meaningless', () => {
    expect(() => moneyNonNegative.parse('-1')).toThrow();
  });
});

describe('toWire', () => {
  it('round-trips a bigint through the wire format', () => {
    expect(money.parse(toWire(987654321987654321n))).toBe(987654321987654321n);
  });
});

describe('isFree', () => {
  it('is true only for exactly zero', () => {
    expect(isFree(0n)).toBe(true);
    expect(isFree(1n)).toBe(false);
  });
});
