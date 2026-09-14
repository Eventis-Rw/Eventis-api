# System overview

```
  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
  │ Mobile app   │   │ Web app          │   │ Website          │
  │ Expo / RN    │   │ public + admin   │   │ marketing        │
  └──────┬───────┘   └────────┬─────────┘   └────────┬─────────┘
         │                    │                      │
         └──────── HTTPS / JSON ────────────────────-┘
                              │
                      ┌───────▼────────┐
                      │  Cloudflare    │  CDN + WAF + rate limit
                      └───────┬────────┘
                              │
                 ┌────────────▼─────────────┐
                 │ NestJS API (Fastify)     │
                 │ modular monolith         │
                 └──┬──────────┬─────────┬──┘
                    │          │         │
           ┌────────▼──┐  ┌────▼───┐  ┌──▼─────────┐
           │ PostgreSQL│  │ Redis  │  │ Cloudflare │
           │ + PostGIS │  │        │  │     R2     │
           └───────────┘  └───┬────┘  └────────────┘
                              │
                      ┌───────▼────────┐
                      │ BullMQ workers │  outbox, notifications,
                      │ + repeatable   │  reconciliation, settlement,
                      │   jobs         │  hold expiry
                      └───────┬────────┘
                              │
              ┌───────────────┼────────────────┐
         ┌────▼─────┐  ┌──────▼──────┐  ┌──────▼──────┐
         │ MoMo /   │  │ SMS gateway │  │ FCM / APNs  │
         │ Airtel   │  │   (OTP)     │  │   (push)    │
         └──────────┘  └─────────────┘  └─────────────┘
```

One API deployable. One database. Workers are the same Docker image with a different
command.

## The four flows, and nothing else

```
LISTING     organizer registers, gets verified, publishes an event
   ↓
DISCOVERY   user finds it by location, date, category, keyword
   ↓
TICKETING   user reserves (free) or buys (paid), gets a signed QR ticket
   ↓
CHECK-IN    gate staff scans the QR at the venue, offline-capable
```

**Explicitly out of scope, permanently**, so that it stops being proposed: chat, dating,
wallets, tokens, gifting, live video, recommendation ML, social feeds.

## Modules

| Module | Owns |
|---|---|
| `platform` | clock, health, outbox, idempotency, audit log, feature flags |
| `identity` | users, OTP, JWT, sessions, devices, RBAC |
| `org` | organizers, verification workflow, staff membership |
| `catalog` | events, categories, venues, ticket types, media |
| `discovery` | geo queries, ranking, search, caching |
| `commerce` | orders, inventory, tickets, QR, check-in |
| `payments` | provider abstraction, intents, webhooks, settlement |
| `ledger` | accounts, transactions, entries |
| `notification` | push, SMS, email |
| `moderation` | reports, review queue |
| `analytics` | instrumentation, organizer metrics |

## The rules that are never negotiable

1. **Never return a database row.** Every response goes through a mapper returning a
   contract type.
2. **Money is `bigint` minor units**, serialized as a string. Never a `number`.
3. **Never grant an entitlement from a client callback.** Only a server-verified
   provider confirmation issues a ticket.
4. **`unknown` is a real payment state**, not an error, and it is never retried blindly.
5. **Every outbox and webhook consumer is idempotent.** Delivery is at-least-once.
6. **Anything that checks-then-writes does both in one atomic statement.**
