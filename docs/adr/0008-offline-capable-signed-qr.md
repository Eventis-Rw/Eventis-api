# 0008 — Offline-verifiable signed QR tickets

**Status:** Accepted · **Date:** 2026-09-14

## Context

Kigali venues routinely have unusable mobile data at the gate: a few hundred people in
one place, all on their phones. A scanner that needs the network to admit someone will
fail exactly when it matters.

## Decision

The QR is a **signed compact payload**, not a plaintext serial:

```
base64url( {t: ticketId, e: eventId, x: expiry, v: version} + '.' + ed25519Signature )
```

The scanner ships the **public** key and verifies with no network at all. A forged
ticket is rejected at the gate, offline, in milliseconds.

Check-in is an idempotent state transition through a conditional UPDATE — the same
pattern as inventory reservation, and for the same reason:

```ts
const [row] = await db.update(tickets)
  .set({ status: 'checked_in', checkedInAt: now, checkedInBy: staffId, gate })
  .where(and(eq(tickets.id, ticketId), eq(tickets.status, 'issued')))
  .returning({ id: tickets.id });
return row ? 'ADMITTED' : await explainRejection(ticketId);
```

Postgres evaluates the condition and the write in one atomic statement, so two scanners
racing on the same ticket produce exactly one `ADMITTED`.

## The honest limitation

**Offline verification proves a ticket is authentic. It does not prove it is unused.**

Two gates that are both offline can admit the same ticket. This is not solved, and
nobody on this team may claim it is.

Mitigations, in order of cost:

1. One scanner per event for small events. Trivially correct.
2. Gates syncing over local wifi, so they share check-ins without the internet.
3. Accept it and reconcile afterwards. At Rwandan ticket prices the fraud ceiling is
   low, and the reconciliation report shows exactly which tickets were double-scanned.

## Consequences

The signing private key never leaves the server. Only the public key ships to scanners,
so a stolen scanner cannot mint tickets.

Keys are versioned (`v` in the payload, `TICKET_SIGNING_KEY_VERSION` in config) so a key
can be rotated without invalidating tickets already in people's wallets.

Scanners POST their whole offline queue on reconnect. The server dedupes on
`clientScanId`, so replaying a batch cannot double-count.
