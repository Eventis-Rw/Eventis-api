import { Inject, Injectable, Logger, Optional, type OnModuleDestroy } from "@nestjs/common";
import { Queue, Worker, type Job } from "bullmq";
import { Redis as IORedis } from "ioredis";

import { ENV, type Env } from "../../config/env.js";

import type { EmailProvider, SendEmailInput } from "./email-provider.js";

export const EMAIL_QUEUE_NAME = "email";

/** BullMQ requires this for blocking commands used by Worker/Queue internals. */
export function createQueueConnection(env: Env): IORedis {
  // lazyConnect so constructing this (e.g. via DI in unit tests) never
  // opens a socket until a job is actually enqueued/processed.
  return new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
}

export const EMAIL_QUEUE = Symbol("EMAIL_QUEUE");

@Injectable()
export class EmailQueue implements OnModuleDestroy {
  private readonly logger = new Logger(EmailQueue.name);
  private readonly queue: Queue<SendEmailInput>;

  constructor(
    @Inject(ENV) env: Env,
    @Optional() queueOverride?: Queue<SendEmailInput>,
  ) {
    this.queue =
      queueOverride ??
      new Queue<SendEmailInput>(EMAIL_QUEUE_NAME, {
        connection: createQueueConnection(env),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 500 },
        },
      });
  }

  /**
   * Enqueues an email for delivery with retries. Passing `jobId` makes the
   * send idempotent: BullMQ will not create a second job for an id that is
   * still waiting/active/delayed, or that already completed and hasn't been
   * pruned yet — so retrying the caller's own action never double-sends.
   */
  async enqueue(input: SendEmailInput, jobId?: string): Promise<void> {
    try {
      await this.queue.add(EMAIL_QUEUE_NAME, input, jobId ? { jobId } : {});
    } catch (err) {
      this.logger.error({ err, to: input.to, subject: input.subject }, "Failed to enqueue email");
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
  }
}

/**
 * Starts the worker that actually delivers queued emails. Only the worker
 * process (src/worker.ts) should call this — the API process only enqueues.
 */
export function startEmailWorker(env: Env, provider: EmailProvider): Worker<SendEmailInput> {
  const logger = new Logger("EmailWorker");
  const worker = new Worker<SendEmailInput>(
    EMAIL_QUEUE_NAME,
    async (job: Job<SendEmailInput>) => {
      await provider.send(job.data);
    },
    { connection: createQueueConnection(env) },
  );
  worker.on("completed", (job) => {
    logger.log(`Email delivered to ${job.data.to} (${job.data.subject})`);
  });
  worker.on("failed", (job, err) => {
    logger.error(
      { err, to: job?.data.to, subject: job?.data.subject, attemptsMade: job?.attemptsMade },
      "Email delivery failed after retries",
    );
  });
  return worker;
}
