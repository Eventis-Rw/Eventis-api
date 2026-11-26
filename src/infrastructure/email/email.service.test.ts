import { describe, expect, it } from "bun:test";

import { EmailService } from "./email.service.js";
import { FakeEmailProvider } from "./fake-email.provider.js";

const noopQueue = { enqueue: () => Promise.resolve() } as never;

describe("EmailService.sendWithRetry", () => {
  it("returns without retrying when the first attempt succeeds", async () => {
    const provider = new FakeEmailProvider();
    const service = new EmailService(provider, noopQueue);

    await service.sendWithRetry(
      { to: "a@example.com", subject: "Hi", html: "<p>hi</p>" },
      { delayMs: 1 },
    );

    expect(provider.sent).toHaveLength(1);
  });

  it("retries once after a failure, then succeeds", async () => {
    let calls = 0;
    const provider = {
      send: () => {
        calls++;
        if (calls === 1) return Promise.reject(new Error("transient"));
        return Promise.resolve();
      },
    };
    const service = new EmailService(provider as never, noopQueue);

    await service.sendWithRetry(
      { to: "a@example.com", subject: "Hi", html: "<p>hi</p>" },
      { attempts: 2, delayMs: 1 },
    );

    expect(calls).toBe(2);
  });

  it("throws the last error once every attempt has failed", async () => {
    const provider = { send: () => Promise.reject(new Error("down")) };
    const service = new EmailService(provider as never, noopQueue);

    await expect(
      service.sendWithRetry(
        { to: "a@example.com", subject: "Hi", html: "<p>hi</p>" },
        { attempts: 2, delayMs: 1 },
      ),
    ).rejects.toThrow("down");
  });
});

describe("EmailService.sendBestEffort", () => {
  it("delegates to the queue with the given jobId", async () => {
    const calls: Array<{ input: unknown; jobId: string | undefined }> = [];
    const queue = {
      enqueue: (input: unknown, jobId?: string) => {
        calls.push({ input, jobId });
        return Promise.resolve();
      },
    };
    const service = new EmailService(new FakeEmailProvider(), queue as never);

    await service.sendBestEffort({ to: "a@example.com", subject: "Hi", html: "<p>hi</p>" }, "job-1");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.jobId).toBe("job-1");
  });
});
