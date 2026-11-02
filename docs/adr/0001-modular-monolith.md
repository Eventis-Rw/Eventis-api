# 0001 — A modular monolith, not microservices

**Status:** Accepted · **Date:** 2026-09-14

## Context

One tech lead and seven or eight interns, building event discovery, listing, ticketing
and check-in for a single city, with no traffic yet.

## Decision

One deployable API, one database, eleven modules with enforced boundaries. Workers run
the same image with a different command.

## Why not microservices

At this size a service boundary buys nothing and costs everything. The parts of this
system that must be consistent — reserving inventory, issuing a ticket, and writing the
ledger entries for the money that paid for it — would become distributed transactions,
which is a category of bug interns cannot debug and a tech lead should not have to.

The operational cost is also real: separate deploys, separate logs, network failure
between every call, and a tracing setup before the first paying customer.

## What makes this a *modular* monolith rather than a monolith

TypeScript will happily let `catalog` import from `commerce`. Nothing stops it, and
nothing about good intentions survives eight people pushing daily for six weeks.

So the boundaries are enforced mechanically, in CI:

- Every module exposes exactly one public surface, its `index.ts`. `commerce` calls
  `catalogService.getPublishableEvent(id)` and never touches the `events` table.
- dependency-cruiser fails the build on a deep import, a layer inversion, a cycle, or
  any module but `payments` and `commerce` reaching the ledger.
- `scripts/verify-boundaries.sh` writes deliberate violations and asserts each rule
  fails, because a rule nobody has watched fail is a comment.

## Consequences

The whole API scales as one unit. Acceptable — the feed is cacheable and the expensive
path is Postgres, not the Node process.

**Revisit when** one module's resource profile genuinely diverges (most likely
`discovery` under load, or media processing), and only then. Extracting a module whose
boundary is already enforced is a contained piece of work; that is the point of paying
the enforcement cost now.
