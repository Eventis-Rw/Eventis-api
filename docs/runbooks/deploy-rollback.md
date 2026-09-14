# Runbook — rolling back a deploy

## Decide fast

Roll back if: error rate is up, payment success rate is down, `/readyz` is failing, or
latency has materially regressed. **Roll back first and diagnose afterwards.** A
five-minute rollback is cheaper than a thirty-minute debug with users affected.

## Roll back the application

```bash
# images are tagged with the commit sha
docker pull ghcr.io/eventis-rw/eventis-api:<previous-sha>
docker compose up -d api worker
curl -fsS https://api.eventis.rw/readyz
```

## The migration question

**Migrations are forward-only. Rolling back the application does not roll back the
database.**

This is survivable because column changes use expand-and-contract (see the migrations
guide): the previous application version still works against the new schema, since the
old column is still there.

If a migration is itself the problem:

- **Additive** (new table, new nullable column, new index) — harmless. Leave it. Roll
  back the app only.
- **Destructive** (dropped column, changed type) — the old app will not work against it.
  Do not improvise. Escalate to the tech lead and consider a point-in-time restore.

This is why step 6 of expand-and-contract — the drop — is deployed on its own, days
after everything else, with nothing else in the release.

## After

- Confirm recovery: error rate, payment success rate, queue depth, outbox lag.
- Check whether anything was lost in the window: stuck payments, undelivered outbox rows.
- Write the incident note the same day, while you still remember it: what happened, what
  was noticed first, what would have caught it earlier.
