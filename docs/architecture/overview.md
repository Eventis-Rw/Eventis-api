# System overview

```
Mobile App / Web App / Website
            ↓
      HTTPS / JSON (REST)
            ↓
        Cloudflare
            ↓
     NestJS API (Fastify)
     modular monolith
            ↓
         Modules
            ↓
       Application
            ↓
         Domain
            ↓
       Repositories
            ↓
          Prisma
            ↓
   PostgreSQL + PostGIS
            │
            ├── Redis (queues, cache) — ready
            ├── Object storage (R2 / MinIO)
            └── BullMQ workers (same image)
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

**Explicitly out of scope, permanently**: chat, dating, wallets, tokens, gifting,
live video, recommendation ML, social feeds.

## Implemented today

| Module     | Status                                       |
| ---------- | -------------------------------------------- |
| `platform` | Health probes, shared clock                  |
| `events`   | **Reference module** — create / get / update |

Everything else is planned. Do not create empty module folders — follow
[adding a module](../guides/adding-a-module.md) when you start one.

## Planned modules

These modules will follow the same architecture demonstrated by `events`:

| Module          | Owns                                                  |
| --------------- | ----------------------------------------------------- |
| `identity`      | Authentication, OTP, sessions, tokens, devices, RBAC  |
| `users`         | User profile and user-specific information            |
| `organizations` | Organizations, memberships and staff                  |
| `catalog`       | Categories and reusable catalog data                  |
| `venues`        | Physical / event locations                            |
| `events`        | Event lifecycle and event management _(reference)_    |
| `discovery`     | Search, filtering, location-based discovery (PostGIS) |
| `ticketing`     | Ticket types, inventory, issuance and validation      |
| `orders`        | Customer orders and order lifecycle                   |
| `payments`      | Payment provider integration                          |
| `ledger`        | Financial accounting and double-entry ledger          |
| `checkin`       | Ticket scanning and attendance                        |
| `notifications` | SMS, push notifications and email                     |
| `moderation`    | Moderation workflows                                  |
| `analytics`     | Reporting and analytics                               |

## How infrastructure fits

| Concern              | Where it lives                                                              |
| -------------------- | --------------------------------------------------------------------------- |
| PostgreSQL + PostGIS | Prisma + SQL migrations under `prisma/`                                     |
| Redis                | Configured via `REDIS_URL`; BullMQ / cache adapters land with their modules |
| Object storage       | `STORAGE_*` env vars; MinIO locally, R2 in production                       |
| Queues               | BullMQ workers in `src/worker.ts`, same image as the API                    |
| Payments / SMS       | Provider env vars; use `fake` locally, real providers only in production    |

## The rules that are never negotiable

1. **Never return a database row.** Every response goes through a mapper.
2. **Money is `bigint` minor units**, serialized as a string. Never a `number`.
3. **Never grant an entitlement from a client callback.** Only a server-verified
   provider confirmation issues a ticket.
4. **`unknown` is a real payment state**, not an error, and it is never retried blindly.
5. **Every outbox and webhook consumer is idempotent.** Delivery is at-least-once.
6. **Anything that checks-then-writes does both in one atomic statement.**
