import { afterEach, describe, expect, it, spyOn } from "bun:test";

import { AppError } from "../../../../common/errors/app-error.js";
import { loadEnv } from "../../../../config/env.js";

import { AfricasTalkingSmsProvider } from "./africas-talking.provider.js";

const env = loadEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://localhost:5432/eventis",
  REDIS_URL: "redis://localhost:6379",
  JWT_ACCESS_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  TICKET_SIGNING_PRIVATE_KEY: "private",
  TICKET_SIGNING_PUBLIC_KEY: "public",
  STORAGE_ENDPOINT: "http://localhost:9000",
  STORAGE_BUCKET: "eventis-test",
  STORAGE_ACCESS_KEY_ID: "key",
  STORAGE_SECRET_ACCESS_KEY: "secret",
  SMS_PROVIDER: "africas_talking",
  AT_USERNAME: "test",
  AT_API_KEY: "test-key",
});

const provider = new AfricasTalkingSmsProvider(env);
const input = {
  to: "+250789922141",
  message: "Your verification code is 123456.",
};

let restoreFetch: (() => void) | undefined;

afterEach(() => {
  restoreFetch?.();
  restoreFetch = undefined;
});

function respondWith(body: string): void {
  const fetchMock = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(body, { status: 200 }),
  );
  restoreFetch = () => fetchMock.mockRestore();
}

async function expectSmsFailure(): Promise<void> {
  try {
    await provider.send(input);
    throw new Error("Expected SMS delivery to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
  }
}

describe("AfricasTalkingSmsProvider", () => {
  it("fails when Africa's Talking reports a rejected recipient", async () => {
    respondWith(
      JSON.stringify({
        SMSMessageData: {
          Recipients: [{ statusCode: 100, status: "Rejected" }],
        },
      }),
    );

    await expectSmsFailure();
  });

  it("fails when Africa's Talking returns a rejection code as a string", async () => {
    respondWith(
      JSON.stringify({
        SMSMessageData: {
          Recipients: [{ statusCode: "402", status: "InvalidPhoneNumber" }],
        },
      }),
    );

    await expectSmsFailure();
  });

  it("accepts a queued recipient", async () => {
    respondWith(
      JSON.stringify({
        SMSMessageData: {
          Recipients: [{ statusCode: 102, status: "Queued" }],
        },
      }),
    );

    await provider.send(input);
  });

  it("fails when Africa's Talking returns an unreadable response", async () => {
    respondWith("not-json");

    await expectSmsFailure();
  });
});
