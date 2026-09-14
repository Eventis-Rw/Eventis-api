# 0004 — REST with shared Zod schemas, not tRPC

**Status:** Accepted · **Date:** 2026-09-14

## Context

tRPC is tempting in an all-TypeScript codebase: end-to-end types with no code
generation and no schema duplication.

## Decision

Versioned REST, validated and typed by Zod schemas shared through `@eventis/contracts`.

## Why not tRPC

**Version skew.** tRPC couples client and server types at build time, which works when
they deploy together. The mobile app does not deploy together. A user in Nyamirambo will
be running the build from four months ago because they have not updated and you cannot
make them, and that build must keep working against today's server.

That requires a stable, versioned HTTP contract — `/api/v1/...` in the path, not a
type-level coupling that assumes both halves shipped at once.

## What we keep

Almost all of tRPC's benefit, by sharing the schemas instead of the transport:

```ts
import { eventListQuery, type EventSummary } from '@eventis/contracts';
```

The API validates with `eventListQuery` and types its responses as `EventSummary[]`.
Web and mobile import the same types. Rename a field and the clients break in CI.

## Consequences

Two small obligations, both deliberate:

- **Every response is built by an explicit mapper returning a contract type.** Never
  return a database row. Returning rows is how an internal `verificationNotes` field
  ends up on every mobile client in the country.
- **A contract change is a version bump**, published from `Eventis-contracts`. See its
  versioning guide for how to land a breaking change without breaking old builds.

An OpenAPI document is generated from the same Zod schemas (`bun run openapi`), so the
contract is inspectable and a non-TypeScript client could be written later.
