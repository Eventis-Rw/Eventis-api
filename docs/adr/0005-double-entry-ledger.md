# 0005 — A double-entry ledger, not a balance column

**Status:** Accepted · **Date:** 2026-09-14

## Context

Even with nothing but ticket sales, a single payment is simultaneously: money sitting
in provider clearing, a platform fee earned, and a payable owed to the organizer.

## Decision

Double-entry accounting: `ledger_accounts`, `ledger_transactions`, `ledger_entries`.
Balances are **derived** from entries, never stored as the source of truth.

Account kinds for v1: `provider_clearing`, `organizer_payable`, `organizer_settled`,
`platform_revenue`, `platform_fee_expense`, `refund_liability`.

## Why not a balance column

A single `balance` column cannot represent the three simultaneous facts above, and it
cannot be audited. When an organizer disputes a payout — and one will, within weeks of
launch — a balance column can only say what the number is now. Entries can say how it
got there.

A column also has no way to be *provably* right. Entries do: they must sum to zero.

## The two invariants live in SQL, not TypeScript

TypeScript is not where correctness is enforced under concurrency.

```sql
-- entries in a transaction must net to zero, checked at COMMIT
CREATE CONSTRAINT TRIGGER ledger_balanced
AFTER INSERT ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_transaction_balanced();

-- append-only: history is not editable, by anyone, ever
CREATE RULE ledger_entries_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
CREATE RULE ledger_entries_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;
```

`DEFERRABLE INITIALLY DEFERRED` is what allows a transaction to insert its debit and
its credit in either order and still be checked as a whole at commit.

## Consequences

Reads are more expensive than a column. If that ever matters, add a
`ledger_account_balances` cache written **in the same transaction** under
`SELECT ... FOR UPDATE`, plus a nightly job that recomputes from entries and alerts on
drift.

**Build the drift alert in week 8 regardless.** It will find your first real money bug,
and without it you will not know you have one until an organizer tells you.

Money is `bigint` minor units throughout — see the contracts ADR 0004.
