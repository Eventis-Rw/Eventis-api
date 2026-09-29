# Repository topology and engineering standards

How the five Eventis repositories relate, and the standards that apply across all of
them. This is the only document that describes the whole estate; each repository's own
README covers just itself.

**Date:** 2026-09-14 (updated 2026-09-29 for Prisma)
**Status:** Approved
**Scope:** Architecture, standards, docs, CI. Product features land module by module.

---

## 1. Decisions taken on 2026-09-14 (updated)

| #   | Decision                                                                           | Rationale                                                                                         |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| D1  | **Polyrepo**, five repos under `Eventis-Rw`                                        | The four product repos already exist; a fifth, `Eventis-contracts`, carries the shared packages   |
| D2  | Shared code published to **npmjs** as `@eventis/*`                                 | GitHub Packages' npm registry requires `NODE_AUTH_TOKEN` even for public packages; npmjs does not |
| D3  | **Bun 1.4.2** as package manager, script runner and test runner                    | Team decision. Single toolchain, fast installs, native TS                                         |
| D4  | All repos **public**, **MIT**                                                      | Owner decision                                                                                    |
| D5  | `Eventis-website` = marketing only; `Eventis-web-app` = public event pages + admin | Two audiences, two deploys                                                                        |
| D6  | `Eventis-mobile-app` = Expo workspace                                              | Stays on its own package manager                                                                  |
| D7  | Integration tests against **docker-compose services**                              | Compose is what developers already run                                                            |
| D8  | **Prisma** as the API ORM _(supersedes ADR 0003)_                                  | See [ADR 0009](../adr/0009-prisma-over-drizzle.md)                                                |

## 2. Out of scope, permanently

Chat, dating, wallets, tokens, gifting, live video, recommendation ML, social feeds.

## 3. Repository topology

```
Eventis-Rw/
├── Eventis-contracts     bun workspace → publishes @eventis/* to npm
├── Eventis-api           NestJS (Fastify) modular monolith + BullMQ workers
├── Eventis-web-app       Next.js — public event pages + admin
├── Eventis-website       Next.js — marketing only
└── Eventis-mobile-app    Expo — consumer mobile app
```

### Shared packages

| Package                  | Contents                                                | Consumed by                   |
| ------------------------ | ------------------------------------------------------- | ----------------------------- |
| `@eventis/contracts`     | Zod schemas, inferred types, error codes, money helpers | api, web-app, website, mobile |
| `@eventis/tokens`        | design tokens                                           | web-app, website, mobile      |
| `@eventis/ui-web`        | shared React web primitives                             | web-app, website              |
| `@eventis/eslint-config` | one lint rulebook                                       | all                           |
| `@eventis/tsconfig`      | one compiler baseline                                   | all                           |

**`@eventis/contracts` has no runtime dependency other than Zod.** That lets the mobile
app import it without pulling Prisma, Nest, or a Postgres driver.

### Where the database lives

The Prisma schema and migrations live in `Eventis-api/prisma/`. Only the API touches
Postgres, so there is no shared `packages/db`.

### Local setup when packages are unpublished

Until `@eventis/*` packages are published to npm, `bun install` cannot resolve them
from the public registry. Link them from a local clone of
[Eventis-contracts](https://github.com/Eventis-Rw/Eventis-contracts):

```bash
# In Eventis-contracts
bun install
bun run --filter @eventis/contracts build
cd packages/contracts && bun link
cd ../eslint-config && bun link
cd ../tsconfig && bun link

# In Eventis-api
bun link @eventis/contracts @eventis/eslint-config @eventis/tsconfig
bun install
```

Do **not** commit a lockfile that resolves through `bun link` — it breaks CI for
everyone else. Consumer CI stays red until the first publish. See the contracts
[versioning guide](https://github.com/Eventis-Rw/Eventis-contracts/blob/main/docs/guides/versioning.md).

## 4. API layering

Every module in `Eventis-api/src/modules/` has the identical shape. The complete
worked example is `events`:

```
modules/events/
├── index.ts                  PUBLIC SURFACE
├── events.module.ts
├── api/                      TRANSPORT — routes, DTOs, validation
├── application/              USE CASES — one service file per use case
├── domain/                   BUSINESS RULES — pure
├── infrastructure/           PERSISTENCE — the only place Prisma is imported
└── mappers/                  domain → API response
```

### Dependency rules (enforced by dependency-cruiser)

1. `api` → `application` → `{ domain, infrastructure }`
2. `domain` imports **nothing** from other layers or modules
3. `api` may **never** import `infrastructure` or Prisma
4. Nothing outside a module may import past its `index.ts`
5. `ledger` is importable only by `payments` and `orders`
6. No circular dependencies

## 5. Branching, review and release

```
feat/* fix/* chore/* docs/*  ──PR──▶  dev  ──release PR──▶  main
```

- Conventional Commits, enforced by commitlint
- `CODEOWNERS` assigns the tech lead to payments, ledger, identity, migrations and CI

## 6. CI

Every repo: `lint → typecheck → depcruise → test → build`.

| Repo      | Additional                                                                |
| --------- | ------------------------------------------------------------------------- |
| api       | money-guard, Prisma validate + migrate, integration tests against compose |
| contracts | changesets → publish to npm on merge to `main`                            |

## 7. Bun: benefit and risk

Bun is package manager, script runner and test runner. Bun as the production runtime
for NestJS carries risk; mitigation:

1. Container runtime chosen via Dockerfile build arg
2. CI runs tests under **both** Bun and Node
3. No Bun-only API in application code — runtime specifics live in
   `src/infrastructure/runtime/`
