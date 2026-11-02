# Testing

## What each kind of test is for

| Kind | Location | Needs | Runs in |
|---|---|---|---|
| Domain | `src/modules/*/domain/*.test.ts` | nothing | milliseconds |
| Unit | `src/**/*.test.ts` | fakes | milliseconds |
| Integration | `test/integration/` | Postgres + Redis | seconds |

`bun run test` runs the first two. `bun run test:integration` runs the third and needs
`docker compose -f docker/docker-compose.yml up -d`.

## Write domain tests first

They need no database, no mocks and no fixtures, so they are the tests that will still
pass in a year. If a rule is hard to test, it is usually because it is entangled with
I/O — move it into `domain/` and the test becomes obvious.

## Test the contract, not the internals

A test that asserts a private method was called breaks on every refactor and catches no
bugs. Assert on what a caller can observe.

**Never weaken a test to make it pass.** A failing test is information. If the test is
genuinely wrong, fix it deliberately and say so in the PR.

## A bug fix ships with a regression test that fails first

Write the test. **Watch it fail.** Then fix the code. If you did not see it fail, you
have not proven it tests anything — and a test that passes against the broken code is
worse than no test, because it creates confidence that is not there.

## The failure modes to think about, every time

Nulls and empties · boundaries (0, 1, max, max+1) · **concurrency** · partial failure ·
retries and duplicates · restart mid-state · clocks and timezones · network drop.

For this system specifically:

- **Concurrency.** Two people buying the last ticket. Two gates scanning one QR. Two
  refresh requests with the same token.
- **Duplicates.** Every webhook arrives twice. Every queue job arrives twice. Assert
  that processing twice has the same effect as processing once.
- **Time.** Inject `Clock` and use `FixedClock`. Never `sleep()` in a test — a test
  that sleeps is slow and still flaky.

```ts
const clock = new FixedClock(new Date('2026-09-14T10:00:00Z'));
const service = new CommerceService(repo, catalog, clock);

clock.advanceMs(10 * 60 * 1000 + 1);   // one millisecond past the hold expiry
expect(await service.payOrder(orderId)).rejects.toThrow(/expired/);
```

## Authorization tests are not optional

For every endpoint, at minimum:

- Can user A read user B's ticket?
- Can organizer A edit organizer B's event?
- Can a customer reach an admin endpoint?
- Can gate staff for event X check in a ticket for event Y?

These are the bugs that do not announce themselves. Nothing crashes; the wrong person
simply gets the data.

## Query budgets

Every list endpoint has a query-plan assertion. The specific trap in this codebase:
`ST_DWithin` uses the GiST index and `ST_Distance` in a `WHERE` clause does not — it
sequential-scans the whole table. The test catches it, not the reviewer.

```ts
const plan = await db.execute(sql`EXPLAIN (FORMAT JSON) ${feedQuery}`);
expect(JSON.stringify(plan)).toContain('Index Scan');
expect(JSON.stringify(plan)).not.toContain('Seq Scan on events');
```

## Payments are tested against FakeProvider, always

`FakeProvider` is not optional and it is not a stub that returns success. It must
simulate: success, insufficient funds, user timeout, duplicate webhook, out-of-order
webhook, and the ambiguous-status case.

Every intern develops against it. Nobody touches real credentials.
