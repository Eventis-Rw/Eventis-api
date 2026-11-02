# Testing

## What each kind of test is for

| Kind          | Location                 | Needs                        | Runs in      |
| ------------- | ------------------------ | ---------------------------- | ------------ |
| Domain / unit | `src/**/*.test.ts`       | nothing or fakes             | milliseconds |
| Integration   | `test/integration/`      | Postgres (+ Redis when used) | seconds      |
| E2E           | `test/e2e/` (when added) | running API stack            | seconds      |

```
unit            domain rules, use-case logic with fakes — no database
integration     repositories / Prisma against real Postgres
e2e             HTTP → controller → full stack against a running API
```

`bun run test` runs unit tests under `src/`.
`bun run test:integration` runs integration tests and needs
`docker compose -f docker/docker-compose.yml up -d`.

The `events` module is the worked example: domain tests live next to
`src/modules/events/domain/event.ts`.

## Write domain tests first

They need no database, no mocks and no fixtures, so they are the tests that will still
pass in a year. If a rule is hard to test, it is usually because it is entangled with
I/O — move it into `domain/` and the test becomes obvious.

## Test the contract, not the internals

A test that asserts a private method was called breaks on every refactor and catches no
bugs. Assert on what a caller can observe.

**Never weaken a test to make it pass.** A failing test is information.

## A bug fix ships with a regression test that fails first

Write the test. **Watch it fail.** Then fix the code.

## Failure modes to think about every time

Nulls and empties · boundaries (0, 1, max, max+1) · **concurrency** · partial failure ·
retries and duplicates · restart mid-state · clocks and timezones · network drop.

For this system specifically:

- **Concurrency.** Two people buying the last ticket. Two gates scanning one QR.
- **Duplicates.** Every webhook arrives twice. Every queue job arrives twice.
- **Time.** Inject `Clock` and use `FixedClock`. Never `sleep()` in a test.

## Authorization tests are not optional

For every endpoint, at minimum: can user A read user B's data? Can organizer A edit
organizer B's event? Can a customer reach an admin endpoint?

## Query budgets (discovery)

Every list endpoint should eventually have a query-plan assertion. The specific trap:
`ST_DWithin` uses the GiST index and `ST_Distance` in a `WHERE` clause does not.

## Payments are tested against FakeProvider

When the payments module lands, develop against `FakeProvider` only. Nobody touches
real credentials in day-to-day work.
