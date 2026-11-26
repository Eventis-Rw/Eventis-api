import { Inject, Injectable } from "@nestjs/common";

import { ENV, type Env } from "../../config/env.js";

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_BATCH_SIZE = 100;

/**
 * Sends notifications through Expo's push service. Best-effort: a delivery
 * failure here must never block the action (e.g. a call) that triggered it.
 */
@Injectable()
export class ExpoPushService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async send(messages: PushMessage[]): Promise<void> {
    const targets = messages.filter((m) => m.to);
    if (!targets.length) return;
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json",
    };
    if (this.env.EXPO_ACCESS_TOKEN) {
      headers.authorization = `Bearer ${this.env.EXPO_ACCESS_TOKEN}`;
    }
    for (let i = 0; i < targets.length; i += EXPO_PUSH_BATCH_SIZE) {
      const batch = targets.slice(i, i + EXPO_PUSH_BATCH_SIZE).map((m) => ({
        to: m.to,
        title: m.title,
        body: m.body,
        data: m.data,
        sound: "default",
        priority: "high",
        channelId: "calls",
      }));
      try {
        await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(batch),
          signal: AbortSignal.timeout(10_000),
        });
      } catch {
        // Best-effort; the caller already got its realtime/in-app result.
      }
    }
  }
}
