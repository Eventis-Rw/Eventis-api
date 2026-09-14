# Runbook — database restore

**An untested backup is not a backup.** Practise this in Sprint 5 and every quarter
after. The first time you run it must not be the day you need it.

## Before anything

1. **Stop writes.** Scale the API and workers to zero. A restore racing live traffic
   produces a database that matches nothing.
2. **Note the target time.** Point-in-time recovery needs the moment *just before* the
   damage — usually just before the bad migration or the bad deploy.
3. **Tell the tech lead.** This is never a solo action.

## Restore

Managed Postgres, point-in-time recovery:

```bash
# Restore to a NEW instance. Never restore over the live one — if the target time is
# wrong you have then destroyed your only copy of the current state.
<provider> db restore --source eventis-prod --target eventis-restore-<date> \
  --point-in-time '2026-09-14T13:45:00Z'
```

Verify **before** switching anything:

```sql
SELECT max(created_at) FROM orders;
SELECT count(*) FROM tickets WHERE status = 'issued';
SELECT transaction_id, SUM(amount_minor) FROM ledger_entries
  GROUP BY transaction_id HAVING SUM(amount_minor) <> 0;   -- must be empty
```

Then repoint `DATABASE_URL`, run `bun run db:migrate`, scale the API back up, and check
`/readyz`.

## Afterwards

Anything between the restore point and the incident is gone. Work out what:

- Orders and payments in the window — reconcile against the **provider's** records,
  which are unaffected by our restore and are the authority on what money moved.
- Tickets issued in the window — reissue from the reconciled orders.
- Outbox rows — undelivered notifications are lost; decide whether to resend.

Users whose payment succeeded but whose ticket vanished must be made whole. Find them
from the provider's report, not from our database.

## Prevention

Backups are automated and **restores are tested**. Retention covers at least 7 days of
point-in-time recovery. Production credentials stay with the tech lead alone; interns
get staging and a read-only replica.
