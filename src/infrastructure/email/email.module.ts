import { Module } from "@nestjs/common";

import { ENV, type Env } from "../../config/env.js";

import { BrevoEmailProvider } from "./brevo-email.provider.js";
import { DisabledEmailProvider } from "./disabled-email.provider.js";
import { EMAIL_PROVIDER, type EmailProvider } from "./email-provider.js";
import { EmailQueue } from "./email-queue.js";
import { EmailService } from "./email.service.js";
import { FakeEmailProvider } from "./fake-email.provider.js";

@Module({
  providers: [
    FakeEmailProvider,
    BrevoEmailProvider,
    DisabledEmailProvider,
    EmailQueue,
    {
      provide: EMAIL_PROVIDER,
      inject: [
        ENV,
        FakeEmailProvider,
        BrevoEmailProvider,
        DisabledEmailProvider,
      ],
      useFactory: (
        env: Env,
        fake: FakeEmailProvider,
        brevo: BrevoEmailProvider,
        disabled: DisabledEmailProvider,
      ): EmailProvider =>
        env.EMAIL_PROVIDER === "disabled"
          ? disabled
          : env.EMAIL_PROVIDER === "brevo"
            ? brevo
            : fake,
    },
    EmailService,
  ],
  exports: [EmailService, FakeEmailProvider, EMAIL_PROVIDER],
})
export class EmailModule {}
