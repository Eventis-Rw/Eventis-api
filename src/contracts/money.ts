import { z } from 'zod';

/**
 * Money is ALWAYS a bigint of minor units, and ALWAYS crosses the wire as a string.
 *
 * Two reasons, both of which have cost other people real money:
 *  - JavaScript numbers lose integer precision above 2^53.
 *  - 0.1 + 0.2 !== 0.3. Floating point cannot represent money.
 *
 * Note on RWF: the Rwandan Franc has an ISO 4217 exponent of 0, so one minor unit
 * IS one franc. Do not divide by 100 anywhere. Other currencies added later will
 * have their own exponent — read it from CURRENCIES, never assume 2.
 */

export interface CurrencyMeta {
  readonly code: string;
  /** ISO 4217 minor-unit exponent. RWF is 0. Never assume 2. */
  readonly exponent: number;
  readonly symbol: string;
}

export type CurrencyCode = 'RWF';

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  RWF: { code: 'RWF', exponent: 0, symbol: 'FRw' },
};

export const currency = z.enum(['RWF'] as const);

/** Wire format: a base-10 integer string of minor units. Never a float, never a number. */
export const moneyWire = z
  .string()
  .regex(/^-?(0|[1-9]\d{0,18})$/, 'money must be an integer string of minor units');

/** Parse a wire value into the bigint the server works with. */
export const money = moneyWire.transform((v) => BigInt(v));

/** Non-negative money, for prices and amounts that cannot be negative. */
export const moneyNonNegative = moneyWire
  .refine((v) => !v.startsWith('-'), 'amount must not be negative')
  .transform((v) => BigInt(v));

export const moneyAmount = z.object({
  amountMinor: moneyWire,
  currency,
});
export type MoneyAmount = z.infer<typeof moneyAmount>;

/** Serialize a bigint for JSON. Every response mapper must use this. */
export function toWire(amountMinor: bigint): string {
  return amountMinor.toString(10);
}

/**
 * The ONLY place money is turned into human text. Never call toLocaleString at a
 * call site — eleven slightly different formats is how a finance page stops being
 * trustworthy.
 */
export function formatMinor(
  amountMinor: bigint,
  code: CurrencyCode = 'RWF',
  options: { withSymbol?: boolean; locale?: string } = {},
): string {
  const { withSymbol = true, locale = 'en-RW' } = options;
  const { exponent, symbol } = CURRENCIES[code];

  const negative = amountMinor < 0n;
  const abs = negative ? -amountMinor : amountMinor;

  let text: string;
  if (exponent === 0) {
    text = new Intl.NumberFormat(locale).format(abs);
  } else {
    const divisor = 10n ** BigInt(exponent);
    const whole = abs / divisor;
    const fraction = (abs % divisor).toString().padStart(exponent, '0');
    text = `${new Intl.NumberFormat(locale).format(whole)}.${fraction}`;
  }

  const signed = negative ? `-${text}` : text;
  return withSymbol ? `${signed} ${symbol}` : signed;
}

/** Free is a price of exactly zero, not a null and not a missing field. */
export function isFree(amountMinor: bigint): boolean {
  return amountMinor === 0n;
}
