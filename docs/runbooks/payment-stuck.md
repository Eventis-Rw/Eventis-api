# Runbook — a payment is stuck

## Symptoms

A user says they were charged and got no ticket. Or the admin payments screen shows an
intent in `unknown` or `awaiting_user` well past its timeout.

## First: do not retry it

**Never blindly retry a payment in `unknown`.** `unknown` means *we do not know whether
the money moved*. Retrying is how a customer gets charged twice, and a double charge
costs far more in trust than a delayed ticket.

The truth comes from the provider, via `getStatus()`, never from a guess.

## Diagnose

```sql
SELECT id, order_id, status, provider_ref, created_at, updated_at, attempts
FROM payment_intents
WHERE status IN ('unknown', 'reconciling', 'awaiting_user')
  AND created_at < now() - interval '15 minutes'
ORDER BY created_at;
```

Then for one intent, in order:

1. **Did a webhook arrive?** Check `webhook_events` for its `provider_ref`. If one
   arrived and was not processed, the queue is the problem, not the provider.
2. **What does the provider say?** Use the admin screen's "re-check" action, which calls
   `getStatus()`. This is authoritative.
3. **Is the ledger consistent with that answer?** A `succeeded` payment must have a
   balanced ledger transaction. If it does not, stop and treat it as ledger drift.

## Resolve

| Provider says | Do |
|---|---|
| `succeeded` | Re-run reconciliation for that intent. It issues the ticket and writes the ledger entries idempotently. |
| `failed` | Mark failed. Release the inventory hold. Tell the user they were not charged. |
| still pending | Leave it. Reconciliation backs off exponentially. Tell the user it is with the provider. |
| provider unreachable | Leave it in `reconciling`. Do **not** resolve it manually. |

## Never

- Issue a ticket by hand without a verified provider confirmation.
- Edit `ledger_entries`. They are append-only; the database will refuse, and trying is
  a sign the wrong fix is being attempted. Corrections are new, compensating entries.
- Mark an intent `succeeded` because a user sent a screenshot.

## If many are stuck at once

That is a provider incident, not a per-payment problem. Check the provider status page,
raise it with them, and post an in-app notice. Reconciliation drains the backlog once
they recover — it is designed for exactly this.

## Escalate to the tech lead when

Money moved and the ledger does not agree · more than 10 intents stuck · any suspicion
of a double charge.
