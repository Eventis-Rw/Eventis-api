# Layering and boundaries

## Two kinds of boundary

**Between modules** — `catalog` may not reach into `commerce`.
**Inside a module** — a controller may not reach the database.

Both are enforced by dependency-cruiser in CI. Neither is a convention.

## Between modules

Every module exposes exactly one public surface, its `index.ts`:

```ts
// modules/catalog/index.ts
export { CatalogModule } from './catalog.module.js';
export { CatalogService } from './application/catalog.service.js';
export type { Category } from './domain/category.entity.js';
```

`commerce` calls `catalogService.getPublishableEvent(id)`. It never imports
`CategoryRepository`, and it never touches the `events` table.

Additionally: **only `payments` and `commerce` may reach `ledger`.** A module that can
write ledger entries is a module that can lose money.

## Inside a module

| Layer | May import | May **not** import |
|---|---|---|
| `api/` | `application/`, `mappers/` | `infrastructure/`, drizzle |
| `application/` | `domain/`, `infrastructure/`, other modules' `index.ts` | — |
| `domain/` | **nothing** | every other layer, drizzle, `@nestjs/*`, the clock |
| `infrastructure/` | `domain/`, the database | `api/`, `application/` |
| `mappers/` | `domain/`, `@eventis/contracts` | `api/`, `infrastructure/`, drizzle |

The strictest rule is the most valuable one: **`domain/` imports nothing.** A pure
domain layer can be tested by calling it, which means the rules that decide whether a
ticket is valid or an order can be cancelled have tests that need no database and never
flake.

## Why there are negative tests for the rules

`scripts/verify-boundaries.sh` writes a deliberately violating file for each rule and
asserts dependency-cruiser fails. It runs in CI.

This exists because the first version of these rules was written, reviewed, committed —
and caught nothing. The configuration was subtly wrong and the check passed on a tree
that violated every rule. **A rule nobody has watched fail is a comment, not a rule.**

## If a rule blocks you

The rule is the design. Blocked usually means the code is in the wrong layer:

- Controller needs data → put it in the service.
- Domain needs the database → it is orchestration; move it to `application/`.
- Module needs another module's internals → that behaviour belongs behind the other
  module's service, or it belongs in your module.

If you are genuinely convinced a rule is wrong, change it in its own PR with the
reasoning, not in the PR that it is blocking. Weakening a boundary to unblock a feature
is how the boundary stops existing.
