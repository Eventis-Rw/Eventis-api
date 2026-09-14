# 0007 — A transactional outbox for external effects

**Status:** Accepted · **Date:** 2026-09-14

## Context

Booking a ticket must send a confirmation. The naive implementations both lose messages:

- **Call the notification service inside the transaction.** The call succeeds, the
  transaction then rolls back, and a user has a confirmation for a booking that does
  not exist. Or the call hangs and holds a database transaction open for 30 seconds.
- **Call it right after commit.** The process is killed between the commit and the
  call, and the notification is simply gone with nothing recording that it was owed.

## Decision

Write an `outbox` row **in the same transaction** as the business change. It commits or
it does not — there is no third outcome. A repeatable job polls unpublished rows every
few seconds and enqueues the real work in BullMQ.

## Delivery is at-least-once, so every consumer must be idempotent

This is not advice, it is a requirement. The poller can crash after enqueueing and
before marking the row published; the same job will then be delivered twice. A consumer
that sends an SMS on every delivery sends two.

Consumers dedupe on a natural key — the outbox row id, or the provider event id for
webhooks, backed by a unique index.

## When the outbox is not needed

For work nobody would notice missing — cache warming, analytics events — enqueue
directly after commit. The outbox costs a table write and a polling delay; spend it on
anything a user or an organizer would notice.

## Consequences

A few seconds of latency between commit and side effect. Acceptable for notifications;
the poll interval is tunable.

The table grows forever, so unpublished rows are found by a **partial index** on
`created_at WHERE published_at IS NULL` and published rows are pruned by a retention job.

Outbox lag over five minutes is an alert that wakes someone.
