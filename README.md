# Eventis API

[![CI](https://github.com/Eventis-Rw/Eventis-api/actions/workflows/ci.yml/badge.svg)](https://github.com/Eventis-Rw/Eventis-api/actions/workflows/ci.yml)

Event discovery, listing, ticketing and check-in for Kigali. A modular monolith on
NestJS with the Fastify adapter, **Prisma**, PostgreSQL with PostGIS, Redis and BullMQ.

This repository is the **architecture home** for Eventis: cross-repository decisions are
recorded in [`docs/adr`](docs/adr/).

## Project overview

Eventis connects organizers who list events with people who discover, buy tickets and
check in at the door. This repository owns the HTTP API and workers — not the mobile
or web clients.

The repository is currently an **architectural foundation**:

- Architecture = complete
- Documentation = complete
- Infrastructure foundation = working
- Prisma = configured
- `events` = small working reference module
- Everything else = documented future modules

## Architecture

```
Mobile App
    ↓
REST API
    ↓
NestJS (Fastify)
    ↓
Modules
    ↓
Application (use cases)
    ↓
Domain
    ↓
Repositories
    ↓
Prisma
    ↓
PostgreSQL + PostGIS
```

Supporting infrastructure (configured, not fully productized yet): Redis, object
storage, BullMQ workers, payment/SMS provider env slots.

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

## Repository structure

```
src/
├── main.ts                      API entrypoint
├── worker.ts                    BullMQ workers (same image, different command)
├── app.module.ts
├── config/                      validated environment at boot
├── common/                      clock, errors, filters, Zod pipe
├── infrastructure/
│   ├── database/                PrismaModule + PrismaService
│   └── runtime/                 Bun vs Node isolation
└── modules/
    ├── platform/                health, shared clock
    └── events/                  ← complete reference module
```

```
prisma/
├── schema.prisma                central database schema
└── migrations/                  SQL migrations (owned, reviewable)
```

Planned modules (`identity`, `users`, `organizations`, `catalog`, `venues`,
`discovery`, `ticketing`, `orders`, `payments`, `ledger`, `checkin`,
`notifications`, `moderation`, `analytics`) are documented in
[docs/architecture/overview.md](docs/architecture/overview.md) — not as empty folders.

## Feature module structure (`events`)

```
modules/events/
├── api/
│   ├── dto/
│   │   ├── create-event.dto.ts
│   │   └── update-event.dto.ts
│   └── events.controller.ts
├── application/
│   ├── create-event.service.ts
│   ├── get-event.service.ts
│   └── update-event.service.ts
├── domain/
│   ├── event.ts
│   └── event-status.ts
├── infrastructure/
│   └── event.repository.ts
├── mappers/
│   └── event.mapper.ts
├── events.module.ts
└── index.ts
```

## Request flow

```
POST /api/v1/events
    ↓
EventsController
    ↓
CreateEventService
    ↓
Event domain
    ↓
EventRepository
    ↓
Prisma
    ↓
PostgreSQL
```

Endpoints demonstrated today:

```
POST   /api/v1/events
GET    /api/v1/events/:id
PATCH  /api/v1/events/:id
```

## Database

- **Prisma** is the ORM and schema source of truth ([ADR 0009](docs/adr/0009-prisma-over-drizzle.md))
- **PostgreSQL 16 + PostGIS** via `docker/docker-compose.yml`
- **`pg_trgm`** enabled for future fuzzy search
- Migrations: `bun run db:migrate` → `prisma migrate deploy`
- PostGIS geography columns and other SQL-only features are documented in
  [docs/guides/migrations.md](docs/guides/migrations.md)

## Quick start

> **`@eventis/*` packages are not on npm yet.** Link them from
> [Eventis-contracts](https://github.com/Eventis-Rw/Eventis-contracts) first — see
> [docs/guides/local-setup.md](docs/guides/local-setup.md). Without that step,
> `bun install` cannot resolve `@eventis/contracts`, `@eventis/eslint-config` or
> `@eventis/tsconfig`.

```bash
bun install
cp .env.example .env
bun run scripts/generate-keys.ts >> .env
docker compose -f docker/docker-compose.yml up -d
bunx prisma generate
bun run db:migrate && bun run db:seed
bun run dev
```

```bash
curl localhost:3000/healthz
curl localhost:3000/readyz
curl -s -X POST localhost:3000/api/v1/events \
  -H 'content-type: application/json' \
  -d '{
    "title": "Kigali Tech Meetup",
    "description": "Monthly community meetup",
    "startsAt": "2026-11-01T17:00:00.000Z",
    "endsAt": "2026-11-01T20:00:00.000Z",
    "venueName": "Impact Hub",
    "address": "KN 5 Rd, Kigali"
  }'
```

## Environment

Copy [`.env.example`](.env.example). Important variables:

| Variable                            | Purpose                        |
| ----------------------------------- | ------------------------------ |
| `PORT`                              | HTTP port (default 3000)       |
| `DATABASE_URL`                      | PostgreSQL connection string   |
| `REDIS_URL`                         | Redis for queues / cache       |
| `JWT_*` / `TICKET_SIGNING_*`        | Auth and QR signing keys       |
| `STORAGE_*`                         | Object storage (MinIO locally) |
| `PAYMENT_PROVIDER` / `SMS_PROVIDER` | Use `fake` in development      |
| `LOG_LEVEL` / `SENTRY_DSN`          | Logging and monitoring         |

Never commit `.env`. Secrets are validated at startup — a missing value fails boot.

## Testing

| Kind          | Command                    | What                    |
| ------------- | -------------------------- | ----------------------- |
| Unit / domain | `bun run test`             | Pure rules, pipes, env  |
| Integration   | `bun run test:integration` | Needs Docker (Postgres) |
| Boundaries    | `bun run depcruise`        | Module / layer rules    |

See [docs/guides/testing.md](docs/guides/testing.md).

## Adding a new module

1. Create module directory (`api`, `application`, `domain`, `infrastructure`, `mappers`)
2. Add API layer (controller + DTOs)
3. Add application use cases
4. Add domain objects
5. Add repository (Prisma only here)
6. Add mapper
7. Add module + `index.ts` public surface
8. Add tests
9. Register in `app.module.ts`

Full walkthrough: [docs/guides/adding-a-module.md](docs/guides/adding-a-module.md).

## Architectural rules

- Controllers must remain thin
- Business logic belongs in application / domain
- Prisma belongs in infrastructure
- Modules must not touch another module's database implementation
- Do not import internals past another module's `index.ts`
- Shared contracts belong in `@eventis/contracts`
- External providers stay behind infrastructure interfaces
- Do not put secrets in source control

Enforced by dependency-cruiser in CI — see [docs/architecture/layering.md](docs/architecture/layering.md).

## Commands

| Command                                        | Does                             |
| ---------------------------------------------- | -------------------------------- |
| `bun run dev` / `dev:worker`                   | API / workers, watching          |
| `bun run verify`                               | everything CI runs               |
| `bun run test` / `test:integration`            | unit / integration               |
| `bun run depcruise`                            | module boundaries                |
| `bun run db:migrate` / `db:seed` / `db:studio` | Prisma migrate, seed, studio     |
| `bunx prisma generate` / `validate`            | client generation / schema check |

## Documentation

|                                                                 |                                       |
| --------------------------------------------------------------- | ------------------------------------- |
| [Contributing](CONTRIBUTING.md)                                 | branching, PR rules                   |
| [Architecture decisions](docs/adr/)                             | why things are the way they are       |
| [System overview](docs/architecture/overview.md)                | modules and flows                     |
| [Repository topology](docs/architecture/repository-topology.md) | the five repositories                 |
| [Layering](docs/architecture/layering.md)                       | boundaries                            |
| [Adding a module](docs/guides/adding-a-module.md)               | **start here for your first feature** |
| [Local setup](docs/guides/local-setup.md)                       | from clone to running                 |
| [Testing](docs/guides/testing.md)                               | unit / integration / e2e              |
| [Migrations](docs/guides/migrations.md)                         | Prisma + SQL escape hatches           |
| [Runbooks](docs/runbooks/)                                      | ops procedures                        |
| [Security policy](SECURITY.md)                                  | reporting                             |

## Licence

MIT — see [LICENSE](LICENSE).
