# Runbook — ledger drift

## What fired

The nightly job recomputes every account balance from `ledger_entries` and compares it
against the cached balances. Any mismatch alerts.

**Treat this as a real money bug until proven otherwise.** This alert exists precisely
because it is the thing that finds the first one.

## Immediately

1. **Do not run a settlement batch.** Pause the settlement job. Paying out against a
   balance you cannot trust is the one unrecoverable mistake here.
2. Note the exact time and the affected accounts.

## Diagnose

Unbalanced transactions — there should never be any, since the deferred trigger
enforces it:

```sql
SELECT transaction_id, SUM(amount_minor) AS net
FROM ledger_entries
GROUP BY transaction_id
HAVING SUM(amount_minor) <> 0;
```

**If this returns rows, the constraint trigger is missing or was dropped.** That is the
incident. Find out when and how — check the migration history and the audit log.

Otherwise the entries are sound and the *cache* is wrong:

```sql
SELECT a.id, a.kind, b.balance_minor AS cached, SUM(e.amount_minor) AS actual
FROM ledger_accounts a
JOIN ledger_account_balances b ON b.account_id = a.id
LEFT JOIN ledger_entries e ON e.account_id = a.id
GROUP BY a.id, a.kind, b.balance_minor
HAVING b.balance_minor <> COALESCE(SUM(e.amount_minor), 0);
```

## Resolve

**Cache wrong, entries right** — the good case. Recompute the cache from entries. Then
find the write path that updated the cache outside the entry transaction; that is the
bug, and the recompute is not the fix.

**Entries wrong** — the serious case. Do not edit or delete anything: entries are
append-only and correcting history destroys the audit trail. Write a **compensating
transaction** with its own idempotency key and a `metadata.reason` explaining it, so the
correction is itself auditable. Tech lead only.

## Then

- Reconcile against the provider's settlement report for the same period. Drift often
  means the provider and the ledger disagree, not that the ledger is internally wrong.
- Write the regression test before the fix, and watch it fail.
- Resume settlement only once a recompute shows zero drift.

## Always escalate

Every ledger drift alert goes to the tech lead, without exception.
