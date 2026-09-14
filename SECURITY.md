# Security Policy

## Reporting a vulnerability

Do **not** open a public issue. Email **security@eventis.rw** with a description, reproduction
steps and impact. You will get an acknowledgement within 48 hours.

## This repository is public

Everything committed here is world-readable, permanently, including anything later deleted —
public git history is scraped and cached within minutes. Treat every commit as a press release.

**Never commit:** `.env` files, database URLs with credentials, API keys, MoMo or aggregator
credentials, JWT or Ed25519 signing keys, SMS gateway tokens, Sentry DSNs with write scope,
`.pem` / `.p8` / `.p12` / keystore files, real user phone numbers, real OTPs, production seed data.

Use `.env.example` with empty values. Real values live in the deployment platform's secret store
and in the team password manager. Nowhere else.

If you commit a secret: **rotate it first**, then tell the tech lead. Removing the commit is not
enough and is never the first step.

## Logging rules

Never log a full phone number, an OTP, an access or refresh token, a payment provider reference
with customer PII, or a full request body from `identity` or `payments`. Phone numbers are logged
masked (`+2507****123`). Request IDs are logged always.

## Handling money and personal data

Any change touching authentication, payments, the ledger, or personal data is high-stakes by
default. It requires tech lead review, a regression test, and an entry in the audit log.
