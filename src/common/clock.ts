import { Injectable } from '@nestjs/common';

/**
 * Time is a dependency, not an ambient fact.
 *
 * `new Date()` inside business logic makes a test either non-deterministic or
 * dependent on sleeping, and it makes "what happens at the hold expiry boundary"
 * untestable. ESLint bans `new Date()` outside this file for exactly that reason.
 */
export abstract class Clock {
  abstract now(): Date;

  nowMs(): number {
    return this.now().getTime();
  }

  /** Seconds since epoch, which is what token and QR expiry claims use. */
  nowUnix(): number {
    return Math.floor(this.nowMs() / 1000);
  }
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    // eslint-disable-next-line no-restricted-syntax -- the one place the real clock is read
    return new Date();
  }
}

/** For tests. Advance it explicitly to exercise an expiry boundary. */
export class FixedClock extends Clock {
  constructor(private current: Date) {
    super();
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  advanceMs(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }

  set(date: Date): void {
    this.current = date;
  }
}
