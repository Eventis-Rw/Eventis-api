# Local setup

Target: a running stack in under 30 minutes. **If it takes longer, the setup is the bug.**

## Prerequisites

- [Bun](https://bun.sh) 1.4.2 or later — `curl -fsSL https://bun.sh/install | bash`
- Docker Desktop (or Engine), running
- A local clone of [Eventis-contracts](https://github.com/Eventis-Rw/Eventis-contracts)
  until `@eventis/*` packages are published to npm (see below)

## Shared packages (required until npm publish)

`@eventis/contracts`, `@eventis/eslint-config` and `@eventis/tsconfig` are **not** on
the public npm registry yet. Without linking them, `bun install` fails.

```bash
git clone https://github.com/Eventis-Rw/Eventis-contracts.git
cd Eventis-contracts
bun install
bun run --filter @eventis/contracts build
cd packages/contracts && bun link
cd ../eslint-config && bun link
cd ../tsconfig && bun link
```

Then in this repository:

```bash
bun link @eventis/contracts @eventis/eslint-config @eventis/tsconfig
```

Undo with `bun unlink` **before you commit** a lockfile. A linked dependency in a
committed lockfile breaks CI for everyone else.

## Steps

```bash
git clone https://github.com/Eventis-Rw/Eventis-api.git
cd Eventis-api
# link packages first (see above), then:
bun install

cp .env.example .env
bun run scripts/generate-keys.ts >> .env     # fills in the JWT and ticket signing keys

docker compose -f docker/docker-compose.yml up -d
# Prisma CLI needs Node >= 18.18 (system Node 16 will fail its preinstall).
bunx prisma generate
bun run db:migrate
bun run db:seed

bun run dev
```

> **Runtime note.** NestJS under Bun can fail on decorator metadata on some machines.
> If `bun run dev` crashes on `@Get` / `@Controller`, build and run with Node 22+:
> `bun run build && node dist/main.js`. CI verifies both runtimes.

### What Docker starts

| Service                            | Port        | Purpose                                           |
| ---------------------------------- | ----------- | ------------------------------------------------- |
| PostGIS (`postgis/postgis:16-3.4`) | 5433        | PostgreSQL + PostGIS (host 5433 → container 5432) |
| Redis 7                            | 6379        | Queues / cache                                    |
| MinIO                              | 9000 / 9001 | Local object storage (R2 stand-in)                |
| Mailpit                            | 1025 / 8025 | Catch outbound mail                               |

Database URL matching compose is already in `.env.example`:

```
DATABASE_URL=postgresql://eventis:eventis@localhost:5433/eventis
REDIS_URL=redis://localhost:6379
```

> Host port **5433** is used so a local Postgres already bound to 5432 does not block
> compose. Inside Docker the service is still `db:5432`.

Check it:

```bash
curl localhost:3000/healthz
curl localhost:3000/readyz
curl localhost:3000/api/v1/events/<seeded-id>   # after seed / create
```

Create an event:

```bash
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

Workers, in a second terminal:

```bash
bun run dev:worker
```

## Common problems

**`bun install` fails on `@eventis/*`.** Packages are not published yet. Link them
from Eventis-contracts as above.

**`db:migrate` cannot connect.** Docker is not up, or something else holds port 5432:
`docker compose -f docker/docker-compose.yml ps` and `lsof -i :5432`.

**PostGIS functions missing.** You are on a plain `postgres` image instead of
`postgis/postgis`. Use the compose file.

**The API starts then exits immediately.** Environment validation failed. The error
names the variables; it deliberately does not print their values.
