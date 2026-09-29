# 0009 — Prisma over Drizzle

**Status:** Accepted · **Date:** 2026-09-29 · **Supersedes:** [0003](0003-drizzle-over-prisma.md)

## Context

ADR 0003 chose Drizzle because several PostgreSQL features Eventis needs cannot be
expressed as first-class Prisma schema constructs (PostGIS `geography`, deferred
constraint triggers, append-only ledger rules, generated `tsvector`).

Since then the priority shifted: the repository is an **architectural foundation**,
not a complete product. The team needs:

- faster onboarding for developers who already know Prisma
- a single, widely understood schema definition (`prisma/schema.prisma`)
- NestJS-friendly dependency injection for the database client
- a clear place for PostgreSQL-specific SQL when Prisma cannot represent it

The PostGIS / trigger / tsvector concerns from ADR 0003 remain valid. They are no
longer treated as a reason to reject Prisma entirely — they are handled as
**documented SQL migrations** alongside the Prisma schema.

## Decision

Use **Prisma** as the ORM and the central schema definition.

- Schema lives in `prisma/schema.prisma`
- Migrations live in `prisma/migrations/`
- Access goes through `PrismaService` in `src/infrastructure/database/`
- Business code never imports Prisma outside module `infrastructure/` layers

PostgreSQL features Prisma cannot type safely (PostGIS geography columns, GiST
indexes, deferred triggers, generated columns, `CREATE INDEX CONCURRENTLY`) are
written as hand-edited SQL in migrations and called out in
[docs/guides/migrations.md](../guides/migrations.md).

Drizzle-specific configuration (`drizzle.config.ts`, `drizzle/`, Drizzle schema
files under `src/infra/database`) is removed. The project must not remain in a
mixed Drizzle + Prisma state.

## Consequences

**Good.**

- Clear NestJS integration (`PrismaModule` / `PrismaService`)
- Prisma Studio and migrate workflows familiar to most Nest developers
- Schema is one file reviewers can read end-to-end

**Trade-offs (accepted).**

- Geo and search queries that need PostGIS / `tsvector` go through `$queryRaw` (or
  equivalent) until typed helpers exist — document every such query
- Ledger triggers and append-only rules remain raw SQL, as they would under any ORM
- Interns must still read migration SQL; Prisma generate is not a substitute for review

**Migration implications.**

- Existing Drizzle SQL behaviour (extensions, partial indexes, UUIDs, timestamptz)
  is preserved in the initial Prisma migration
- Future discovery work adds `geography(Point, 4326)` via SQL + `Unsupported` if
  needed — do not invent a fake typed geography column in Prisma
