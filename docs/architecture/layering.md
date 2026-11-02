# Layering and boundaries

## Two kinds of boundary

**Between modules** — `events` may not reach into `orders`.
**Inside a module** — a controller may not reach the database.

Both are enforced by dependency-cruiser in CI. Neither is a convention.

## Dependency direction

```
API (controllers, DTOs)
 ↓
Application (use cases)
 ↓
Domain (pure business rules)
 ↓
Infrastructure (repositories)
 ↓
Prisma
 ↓
PostgreSQL
```

## Between modules

Every module exposes exactly one public surface, its `index.ts`:

```ts
// modules/events/index.ts
export { EventsModule } from "./events.module.js";
export { CreateEventService } from "./application/create-event.service.js";
export type { Event } from "./domain/event.js";
```

Other modules call exported use-case services. They never import
`EventRepository`, and they never touch the `events` table.

Additionally: **only `payments` and `orders` may reach `ledger`.** A module that can
write ledger entries is a module that can lose money.

## Inside a module

| Layer             | May import                                              | May **not** import                                |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------- |
| `api/`            | `application/`, `mappers/`                              | `infrastructure/`, Prisma                         |
| `application/`    | `domain/`, `infrastructure/`, other modules' `index.ts` | —                                                 |
| `domain/`         | **nothing**                                             | every other layer, Prisma, `@nestjs/*`, the clock |
| `infrastructure/` | `domain/`, Prisma                                       | `api/`, `application/`                            |
| `mappers/`        | `domain/`, `@eventis/contracts` (when available)        | `api/`, `infrastructure/`, Prisma                 |

The strictest rule is the most valuable one: **`domain/` imports nothing.** A pure
domain layer can be tested by calling it, which means the rules that decide whether an
event can be published have tests that need no database and never flake.

## Why there are negative tests for the rules

`scripts/verify-boundaries.sh` writes a deliberately violating file for each rule and
asserts dependency-cruiser fails. It runs in CI.

**A rule nobody has watched fail is a comment, not a rule.**

## If a rule blocks you

The rule is the design. Blocked usually means the code is in the wrong layer:

- Controller needs data → put it in the service.
- Domain needs the database → it is orchestration; move it to `application/`.
- Module needs another module's internals → that behaviour belongs behind the other
  module's service, or it belongs in your module.

If you are genuinely convinced a rule is wrong, change it in its own PR with the
reasoning, not in the PR that it is blocking.
