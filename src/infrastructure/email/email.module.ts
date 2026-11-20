import { Module } from "@nestjs/common";

import { ENV, type Env } from "../../config/env.js";

import { BrevoEmailProvider } from "./brevo-email.provider.js";
import { EMAIL_PROVIDER, type EmailProvider } from "./email-provider.js";
import { EmailService } from "./email.service.js";
import { FakeEmailProvider } from "./fake-email.provider.js";

@Module({
  providers: [
    FakeEmailProvider,
    BrevoEmailProvider,
    {
      provide: EMAIL_PROVIDER,
      inject: [ENV, FakeEmailProvider, BrevoEmailProvider],
      useFactory: (
        env: Env,
        fake: FakeEmailProvider,
        brevo: BrevoEmailProvider,
      ): EmailProvider => (env.EMAIL_PROVIDER === "brevo" ? brevo : fake),
    },
    EmailService,
  ],
  exports: [EmailService, FakeEmailProvider],
})
export class EmailModule {}
