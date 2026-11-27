import "reflect-metadata";

import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { ENV, type Env } from "./config/env.js";
import { EMAIL_PROVIDER, type EmailProvider } from "./infrastructure/email/email-provider.js";
import { startEmailWorker } from "./infrastructure/email/email-queue.js";
import {
  runtimeName,
  runtimeVersion,
} from "./infrastructure/runtime/runtime.js";
import { EngagementService } from "./modules/engagement/index.js";


async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  app.enableShutdownHooks();

  const logger = new Logger("worker");
  logger.log(`Eventis worker started — ${runtimeName()} ${runtimeVersion()}`);

  const emailWorker = startEmailWorker(app.get<Env>(ENV), app.get<EmailProvider>(EMAIL_PROVIDER));
  process.on("beforeExit", () => void emailWorker.close());

  const engagement = app.get(EngagementService);
  const runReminders = async () => {
    try {
      const count = await engagement.createUpcomingEventReminders();
      if (count) logger.log(`Created ${count} saved event reminder(s)`);
    } catch (error) {
      logger.error("Could not create saved event reminders", error);
    }
  };
  await runReminders();
  setInterval(() => void runReminders(), 15 * 60 * 1000);
}

void bootstrap();
