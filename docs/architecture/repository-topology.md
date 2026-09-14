# Repository topology and engineering standards

How the five Eventis repositories relate, and the standards that apply across all of
them. This is the only document that describes the whole estate; each repository's own
README covers just itself.

**Date:** 2026-09-14
**Status:** Approved
**Scope:** Week 0 of the twelve-week plan. Structure, standards, docs, CI. No product features.

---

## 1. Decisions taken on 2026-09-14

| # | Decision | Rationale |
|---|---|---|
| D1 | **Polyrepo**, five repos under `Eventis-Rw` | The four product repos already exist; a fifth, `Eventis-contracts`, carries the shared packages |
| D2 | Shared code published to **npmjs** as `@eventis/*` | GitHub Packages' npm registry requires `NODE_AUTH_TOKEN` even for public packages; npmjs does not. Scope `@eventis` verified free |
| D3 | **Bun 1.4.2** as package manager, script runner and test runner | Team decision. Single toolchain, fast installs, native TS |
| D4 | All repos **public**, **MIT** | Owner decision, made with the exposure risk stated |
| D5 | `Eventis-website` = marketing only; `Eventis-web-app` = public event pages + admin | Two audiences, two deploys, two risk profiles |
| D6 | `Eventis-mobile-app` = existing Expo workspace pushed **as-is** | Owner decision. Stays on pnpm; only secret-hygiene fixes applied |
| D7 | Integration tests run against **docker-compose services**, not testcontainers | testcontainers-node under Bun is unproven; compose is what interns already run and what GitHub Actions offers natively |

## 2. Out of scope, permanently

Chat, dating, wallets, tokens, gifting, live video, recommendation ML, social feeds.

## 3. Out of scope, this pass

Product features. This pass delivers structure, enforcement and documentation only. One reference
vertical slice per repo demonstrates the layering; it is a `health` endpoint and one example module,
not a feature.

---

## 4. Repository topology

```
Eventis-Rw/
├── Eventis-contracts     bun workspace -> publishes 5 npm packages
├── Eventis-api           NestJS (Fastify) modular monolith + BullMQ workers
├── Eventis-web-app       Next.js — (public) event pages + (admin) dashboard
├── Eventis-website       Next.js — marketing only
└── Eventis-mobile-app    Expo SDK 54 — imported as-is, pnpm
```

### 4.1 Published packages

| Package | Contents | Consumed by |
|---|---|---|
| `@eventis/contracts` | Zod schemas, inferred types, error codes, `formatMinor()` | api, web-app, website, mobile |
| `@eventis/tokens` | design tokens — colour, type scale, spacing, radius | web-app, website, mobile |
| `@eventis/ui-web` | shared React web primitives | web-app, website |
| `@eventis/eslint-config` | one lint rulebook | all |
| `@eventis/tsconfig` | one compiler baseline | all |

**`@eventis/ui-web` is web-only.** React Native has no DOM. Mobile consumes `@eventis/tokens` and
`@eventis/contracts` only. Enforced by a lint rule, not by a README sentence.

**`@eventis/contracts` has no runtime dependency other than Zod.** That is what lets the mobile app
import it without pulling Drizzle, Nest, or a Postgres driver.

### 4.2 Where the database lives

The Drizzle schema and migrations live in `Eventis-api/src/infra/database/`. Only the API touches
Postgres, so there is no `packages/db`. This keeps `@eventis/contracts` dependency-free.

---

## 5. API layering — `controller → service → repository → domain`

Every module in `Eventis-api/src/modules/` has the identical shape, so an intern who learns one has
learned all eleven.

```
modules/<name>/
├── index.ts                  PUBLIC SURFACE — the only file other modules may import
├── <name>.module.ts
├── api/                      TRANSPORT. Thin: validate -> service -> map -> return
│   ├── <name>.controller.ts
│   └── dto/                  re-exported from @eventis/contracts, never redefined
├── application/              USE CASES. Orchestration, transaction boundaries
│   ├── <name>.service.ts
│   └── use-cases/
├── domain/                   BUSINESS RULES. Pure. Zero I/O. Imports nothing outward
│   ├── <name>.entity.ts
│   └── <name>.policy.ts
├── infrastructure/           PERSISTENCE. The only place Drizzle is imported
│   └── <name>.repository.ts
└── mappers/                  row -> contract type
```

### 5.1 The dependency rules

1. `api` → `application` → `{ domain, infrastructure }`
2. `domain` imports **nothing** from other layers or modules
3. `api` may **never** import `infrastructure`
4. Nothing outside a module may import past its `index.ts`
5. `ledger` is importable only by `payments` and `commerce`
6. No circular dependencies

All six enforced by **dependency-cruiser in CI**, not by code review.

### 5.2 Modules

`platform`, `identity`, `org`, `catalog`, `discovery`, `commerce`, `payments`, `ledger`,
`notification`, `moderation`, `analytics`.

### 5.3 Non-negotiable rules carried from the system design

- Never return a database row. Every response goes through an explicit mapper returning a contract type.
- Money is `bigint` minor units, serialized as a string. `parseFloat` and `Number()` are banned in
  `payments` and `ledger`, enforced by a CI grep guard.
- Never grant an entitlement from a client callback.
- `unknown` is a real payment state, not an error.
- Every outbox consumer is idempotent; delivery is at-least-once.

---

## 6. Frontend layering

`Eventis-web-app` and `Eventis-website` share one shape:

```
src/
├── app/           ROUTING. RSC, layouts, metadata. No business logic
├── features/      per-feature hooks, server actions, queries, schemas
├── components/
│   ├── ui/        shadcn primitives — OWNED, changed only in a dedicated PR
│   └── <feature>/ composed organisms
├── lib/           api-client, auth/BFF, formatting
└── styles/        tokens from @eventis/tokens
```

Rule: `app` → `features` → `components` → `lib`. `components/ui/*` may not import from `features`.
Enforced by dependency-cruiser.

`Eventis-web-app` carries the `(public)/e/[slug]` route with `generateMetadata` producing Open Graph
tags, because organizers share events on WhatsApp and WhatsApp does not run JavaScript.

---

## 7. Branching, review and release

```
feat/* fix/* chore/* docs/*  ──PR──▶  dev  ──release PR──▶  main
```

- `main`: production. Protected. PR-only, 1 approval, all checks green, linear history, no force-push.
- `dev`: integration. Protected. PR-only, checks green.
- Conventional Commits, enforced by commitlint and a PR-title check.
- `CODEOWNERS` assigns the tech lead to `modules/payments`, `modules/ledger`, `modules/identity`,
  all migrations and `.github/**`. Interns do not own payments or ledger — enforced by GitHub,
  not by memory.
- Definition of done lives in the PR template as a checklist.

## 8. CI

Every repo: `lint → typecheck → depcruise → test → build`.

| Repo | Additional |
|---|---|
| api | money-guard grep, `drizzle-kit check`, integration tests against compose services |
| contracts | changesets → publish to npm on merge to `main` |
| web-app, website | Next build |

## 9. Documentation, in every repo

`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`, `CHANGELOG.md`, and:

```
docs/
├── adr/             numbered architecture decision records
├── architecture/    overview, layering, module map, data model
├── guides/          local setup, adding a module, testing, migrations
└── runbooks/        payment stuck, ledger drift, deploy rollback, db restore
```

ADRs 0001–0006 come from the system design. 0007–0010 record decisions D1, D2, D3 and D7 above,
so that in month six nobody has to reverse-engineer them.

## 10. Bun: benefit and risk, stated plainly

Bun is used as package manager, script runner and test runner across the four new repos. That is
low-risk and a clear speed win.

Bun as the **production runtime for NestJS** is the part that carries risk: Bun 1.4's Node
compatibility is strong and decorators with `reflect-metadata` work, but a long-running server with
BullMQ and ioredis under Bun is less battle-tested than under Node.

Mitigation, built in from day one rather than bolted on later:

1. The container runtime is chosen in exactly one place, a build arg in `Dockerfile`.
2. CI runs the API test suite under **both** Bun and Node on every PR, so the day Bun breaks
   something we learn it from a red check, not from production.
3. No Bun-only API is used in application code. Bun-specific calls, if any, live behind
   `src/infra/runtime/`.

Falling back to Node is therefore a one-line change, continuously verified.

`Eventis-mobile-app` stays on **pnpm**. Its `preinstall` hook hard-fails on non-pnpm agents and its
`pnpm-workspace.yaml` carries a catalog plus ~80 platform overrides. Converting it is a real
migration, and the owner's instruction is to import it untouched.

## 11. Mobile import — exactly what changes

Three safety fixes, no restructuring:

1. Add `.env` and `*.env` to `.gitignore`. It is currently **not** ignored, so `git add .` would
   publish `artifacts/api-server/.env` to a public repo.
2. Remove `.DS_Store` files.
3. Add `origin` pointing at GitHub (keeping `gitsafe-backup`), create `dev`, add PR template,
   `CODEOWNERS`, `LICENSE`, CI.

The Replit `artifacts/api-server/` is superseded by `Eventis-api` but ships with the import. Its
README states this so nobody builds on it by mistake.

## 12. Verification

This pass is complete when, for each of the five repos:

- `bun install && bun run lint && bun run typecheck && bun run test && bun run build` passes locally
  (mobile: the pnpm equivalent)
- dependency-cruiser reports zero violations
- CI is green on the initial PR into `dev`
- `main` and `dev` are protected with the stated rules
- the docs tree exists and contains no placeholder text
