export const EMAIL_PROVIDER = Symbol("EMAIL_PROVIDER");

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Overrides the configured sender for this send only (e.g. a dedicated auth sender). */
  fromEmail?: string;
  fromName?: string;
}

export interface EmailProvider {
  send(input: SendEmailInput): Promise<void>;
}
