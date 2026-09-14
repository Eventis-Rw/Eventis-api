# Eventis API

[![CI](https://github.com/Eventis-Rw/Eventis-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Eventis-Rw/Eventis-api/actions/workflows/ci.yml)

Event discovery, listing, ticketing and check-in for Kigali. A modular monolith on
NestJS with the Fastify adapter, PostgreSQL with PostGIS, Redis and BullMQ.

This repository is the **architecture home** for Eventis: cross-repository decisions are
recorded in [`docs/adr`](docs/adr/).

## The four flows, and nothing else

```
LISTING     organizer registers, gets verified, publishes an event
   ↓
DISCOVERY   user finds it by location, date, category, keyword
   ↓
TICKETING   user reserves (free) or buys (paid), gets a signed QR ticket
   ↓
CHECK-IN    gate staff scans the QR at the venue, offline-capable
```

Out of scope, permanently: chat, dating, wallets, tokens, gifting, live video,
recommendation ML, social feeds.

## Quick start

```bash
bun install
cp .env.example .env
bun run scripts/generate-keys.ts >> .env
docker compose -f docker/docker-compose.yml up -d
bun run db:migrate && bun run db:seed
bun run dev
```

```bash
curl localhost:3000/healthz               # liveness
curl localhost:3000/readyz                # readiness, includes the database
curl localhost:3000/api/v1/categories     # the reference endpoint
```

Full walkthrough and troubleshooting: [docs/guides/local-setup.md](docs/guides/local-setup.md).

> **Note — `@eventis/contracts` is not published to npm yet.** Until it is, `bun install`
> cannot resolve it. Link it locally:
> ```bash
> cd ../Eventis-contracts/packages/contracts && bun link
> cd ../../../Eventis-api && bun link @eventis/contracts
> ```
> Consumer CI stays red until the first publish. See the contracts repository's
> [versioning guide](https://github.com/Eventis-Rw/Eventis-contracts/blob/main/docs/guides/versioning.md).

## Layout

```
src/
├── main.ts                 API entrypoint (Fastify, versioning, error envelope)
├── worker.ts               BullMQ workers — same image, different command
├── app.module.ts
├── config/                 environment, validated once at boot
├── common/                 clock, error type, exception filter, Zod pipe
├── infra/                  database, redis, queue, storage, runtime isolation
└── modules/                the eleven bounded areas
    ├── platform/           clock, health, outbox, idempotency, audit log
    ├── identity/           users, OTP, JWT, sessions, RBAC
    ├── org/                organizers, verification, staff
    ├── catalog/            events, categories, venues, ticket types   ← reference module
    ├── discovery/          geo queries, ranking, search, caching
    ├── commerce/           orders, inventory, tickets, QR, check-in
    ├── payments/           providers, intents, webhooks, settlement
    ├── ledger/             accounts, transactions, entries
    ├── notification/       push, SMS, email
    ├── moderation/         reports, review queue
    └── analytics/          instrumentation, organizer metrics
```

## Every module has the same shape

`catalog` is fully built as the worked example. Read it before writing a new module.

```
modules/<name>/
├── index.ts            PUBLIC SURFACE — the only file other modules may import
├── api/                TRANSPORT. Thin: validate → service → map → return
├── application/        USE CASES. Orchestration, transaction boundaries
├── domain/             BUSINESS RULES. Pure — no I/O, no framework, no clock
├── infrastructure/     PERSISTENCE. The only place Drizzle is imported
└── mappers/            row/domain → contract type
```

Allowed direction: `api → application → {domain, infrastructure}`. `domain` imports
nothing. `api` may never import `infrastructure`. Nothing outside a module may import
past its `index.ts`.

**These are enforced in CI, not by review** — see [docs/architecture/layering.md](docs/architecture/layering.md).

## Commands

| Command | Does |
|---|---|
| `bun run dev` / `dev:worker` | API / workers, watching |
| `bun run verify` | everything CI runs |
| `bun run test` / `test:integration` | unit / integration (needs docker) |
| `bun run depcruise` | module boundaries |
| `bun run depcruise:verify` | proves the boundary rules actually fail on a violation |
| `bun run guard:money` | no floating point in payments or ledger |
| `bun run db:generate` / `db:migrate` / `db:check` / `db:seed` | migrations and seed |
| `bun run openapi` | OpenAPI document, generated from the Zod contracts |

## Rules that are never negotiable

1. **Never return a database row.** Every response goes through a mapper whose return
   type comes from `@eventis/contracts`. Returning rows is how an internal
   `verificationNotes` field ends up on every mobile client in the country.
2. **Money is `bigint` minor units**, serialized as a string. Never a `number`. RWF has
   an exponent of 0 — do not divide by 100.
3. **Never grant an entitlement from a client callback.** Only a server-verified
   provider confirmation issues a ticket. This is the most commonly violated rule in
   African fintech integrations and it is how people get free tickets.
4. **`unknown` is a real payment state**, not an error, and it is never retried blindly.
5. **Every outbox and webhook consumer is idempotent.** Delivery is at-least-once.
6. **Anything that checks-then-writes does both in one atomic statement.**
7. **Never log** a full phone number, an OTP, or a token.

## Documentation

| | |
|---|---|
| [Contributing](CONTRIBUTING.md) | branching, PR rules, definition of done |
| [Architecture decisions](docs/adr/) | why things are the way they are |
| [System overview](docs/architecture/overview.md) | the shape of the whole thing |
| [Repository topology](docs/architecture/repository-topology.md) | how the five repositories relate, and the standards across all of them |
| [Layering](docs/architecture/layering.md) | the boundaries and how they are enforced |
| [Adding a module](docs/guides/adding-a-module.md) | **start here for your first feature** |
| [Local setup](docs/guides/local-setup.md) | from clone to running |
| [Testing](docs/guides/testing.md) | what to test and how |
| [Migrations](docs/guides/migrations.md) | the rules, and expand-and-contract |
| [Runbooks](docs/runbooks/) | payment stuck, ledger drift, rollback, restore |
| [Security policy](SECURITY.md) | reporting, and what must never be committed |

## Ownership

Interns do not own `payments` or `ledger`. Not a judgement of ability — a bug there
costs real money, needs an audit trail, and requires context nobody has in their first
months. Enforced by [CODEOWNERS](.github/CODEOWNERS).

## Licence

MIT — see [LICENSE](LICENSE).
