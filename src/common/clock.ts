import { Injectable } from "@nestjs/common";


export abstract class Clock {
  abstract now(): Date;

  nowMs(): number {
    return this.now().getTime();
  }

  nowUnix(): number {
    return Math.floor(this.nowMs() / 1000);
  }
}

@Injectable()
export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
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
