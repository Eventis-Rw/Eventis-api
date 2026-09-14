# Local setup

Target: a running stack in under 30 minutes. **If it takes longer, the setup is the bug** —
say so and we fix it, rather than you losing an afternoon quietly.

## Prerequisites

- [Bun](https://bun.sh) 1.4.2 or later — `curl -fsSL https://bun.sh/install | bash`
- Docker Desktop, running
- `gh` CLI, authenticated

## Steps

```bash
git clone https://github.com/Eventis-Rw/Eventis-api.git
cd Eventis-api
bun install

cp .env.example .env
bun run scripts/generate-keys.ts >> .env     # fills in the JWT and ticket signing keys

docker compose -f docker/docker-compose.yml up -d
bun run db:migrate
bun run db:seed

bun run dev
```

Check it:

```bash
curl localhost:3000/healthz     # {"status":"ok"}
curl localhost:3000/readyz      # database check included
curl localhost:3000/api/v1/categories
```

Workers, in a second terminal:

```bash
bun run dev:worker
```

## What the seed gives you

50 Kigali events across real sectors, 10 organizers in mixed verification states,
200 users, and sample orders — enough to see a populated feed, an approval queue with
things in it, and a realistic query plan.

## Working against unpublished contracts

While you are changing `@eventis/contracts` and it is not released yet:

```bash
cd ../Eventis-contracts/packages/contracts && bun link
cd ../../../Eventis-api && bun link @eventis/contracts
```

Undo with `bun unlink` **before you commit**. A linked dependency in a committed
lockfile breaks CI for everyone else.

## Common problems

**`bun install` fails on `@eventis/contracts`.** The package is not published yet. See
the linking section above, and the note in the README.

**`db:migrate` cannot connect.** Docker is not up, or something else holds port 5432:
`docker compose -f docker/docker-compose.yml ps` and `lsof -i :5432`.

**PostGIS functions missing.** You are on a plain `postgres` image instead of
`postgis/postgis`. Discovery needs PostGIS — use the compose file.

**The API starts then exits immediately.** Environment validation failed. The error
names the variables; it deliberately does not print their values.
