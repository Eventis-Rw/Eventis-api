# 0003 — Drizzle over Prisma

**Status:** Accepted · **Date:** 2026-09-14

## Context

This will be argued about, so the reasoning is written down.

| | Prisma | Drizzle |
|---|---|---|
| Intern ramp-up | easier, better errors, Prisma Studio | steeper, you must know SQL |
| PostGIS geography column | `Unsupported()`, unusable through the client | `customType`, works |
| Editable raw SQL migrations | awkward (`--create-only`) | migrations are plain SQL you own |
| `CREATE INDEX CONCURRENTLY` | fights you | trivial |
| Deferred constraint triggers | not expressible | trivial |
| Generated tsvector column | not expressible | trivial |
| Bundle size / cold start | heavy engine binary | thin |

## Decision

Drizzle.

Four things this system genuinely needs **cannot be expressed in a Prisma schema**:

1. the PostGIS `geography(Point, 4326)` column that discovery depends on,
2. the ledger's deferred sum-to-zero constraint trigger,
3. the append-only rules on `ledger_entries`,
4. the generated `tsvector` column that search depends on.

All four would be written as escape-hatch SQL anyway — at which point the project has
Prisma's learning curve without its main benefit, and every geo query goes through
`$queryRaw` with no type safety at all.

## Consequences

**Bad.** Steeper ramp-up. Interns must read SQL, and some will write a query that does
not use an index.

**Mitigation.** Query-plan assertions in the test suite on every list endpoint. The
specific trap is real and predictable: `ST_DWithin` uses the GiST index and
`ST_Distance` in a `WHERE` clause does not — it sequential-scans the whole table. An
intern will write the second one. The test catches it, not the reviewer.

**Good.** Migrations are plain SQL files in the repository, reviewable line by line,
and editable when a migration needs `CONCURRENTLY` or a trigger.
