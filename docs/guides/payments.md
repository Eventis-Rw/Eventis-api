# Payments module — how it works

The `payments` module handles FindLove subscription payments collected directly with
mobile money (MTN MoMo / Airtel Money, RWF only). Money is never stored in a wallet —
every payment creates a `PaymentIntent`, is confirmed by the provider (sync response,
status polling, or webhook), and then activates a `ServiceSubscription`.

Source: `src/modules/payments/`

## Module structure

```
payments/
├── api/                                  HTTP layer (thin)
│   ├── payments.controller.ts            POST /v1/payments, GET /v1/payments/:id/status, POST /v1/payments/webhook
│   │                                     GET /v1/admin/payments (admin)
│   ├── installments.controller.ts        GET /v1/installments (public), admin CRUD
│   ├── account-subscription.controller.ts GET /v1/findlove/subscription, PATCH /v1/findlove/account-type
│   └── dto/                              Zod validation (snake_case wire format)
├── application/                          Orchestration
│   ├── payments.service.ts               initiate + status + admin list
│   ├── payment-webhook.service.ts        signed webhook processing
│   ├── payment-activation.service.ts    on success → subscription + profile type
│   ├── installment-plans.service.ts      admin plan CRUD
│   └── account-subscription.service.ts  current subscription / switch account type
├── domain/payment.ts                      Pure rules: types, status maps, expiry math (no I/O)
├── infrastructure/
│   ├── payment.repository.ts             Prisma persistence + transactional activation
│   └── providers/
│       ├── payment-provider.ts           PAYMENT_GATEWAY token + PaymentProvider interface
│       ├── fake-payment.provider.ts      dev/test provider (always PENDING, accepts all webhooks)
│       └── aggregator-payment.provider.ts real HTTP provider + HMAC-SHA256 webhook verification
└── mappers/payment.mapper.ts              domain → API responses (bigint → string on the wire)
```

Provider selection is done in `payments.module.ts` via the `PAYMENT_GATEWAY` factory:
`env.PAYMENT_PROVIDER === "aggregator"` → `AggregatorPaymentProvider`, otherwise `FakePaymentProvider`.
Env guard: `fake` is rejected in production, and `aggregator` requires `PAYMENT_WEBHOOK_SECRET`.

## Prisma schema

Migration: `prisma/migrations/20261030120000_findlove_payments/`

```
InstallmentPlan 1───n PaymentIntent 1───1 ServiceSubscription
                        └───n ProviderWebhookEvent
```

### Enums

| Enum                  | Values                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| `FindLoveAccountType` | `PRIVATE`, `PUBLIC`                                                     |
| `InstallmentInterval` | `WEEKLY`, `MONTHLY`, `YEARLY`                                           |
| `PaymentMethod`       | `MTN_MOMO`, `AIRTEL_MONEY`                                              |
| `PaymentStatus`       | `CREATED`, `PROVIDER_REQUESTED`, `AWAITING_USER`, `UNKNOWN`, `RECONCILING`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `CANCELLED` |
| `PaymentPurpose`      | `FINDLOVE`, `ORGANISER_PLAN`, `PROMOTION` (future purposes)             |

### `installment_plans`

A purchasable plan. Unique per `(account_type, interval)` — one weekly private plan,
one monthly public plan, etc.

- `duration_days SMALLINT` — how many days a successful payment grants
- `price_minor BIGINT` — amount in minor units (RWF cents), default currency `RWF`
- `is_active BOOLEAN` — admin can disable a plan without deleting history

### `payment_intents`

The single source of truth for one collection attempt.

- `reference VARCHAR(32)` **unique** — human reference `PAY-<seq>` from the Postgres
  sequence `payment_reference_seq` (starts at 10001). This is the identifier the client
  and the provider use (`payment_id` in API responses).
- `amount_minor`, `currency`, `payment_method`, `phone_number` — what was requested
- `status` — state machine below, default `CREATED`
- `provider`, `provider_transaction_id` — which gateway handled it and its txn id
- `idempotency_key` — unique per user: `@@unique([userId, idempotencyKey])`
- `expires_at` — 10 minutes after creation (`PAYMENT_EXPIRY_MINUTES`)
- `paid_at`, `failure_reason`, `provider_requested_at`
- Purpose-generic columns (`purpose`, `reference_id`) exist for future payment types;
  FindLove sets `accountType` + `installmentPlanId` instead.

### `provider_webhook_events`

Append-only log of every webhook received.

- Unique `(provider, provider_event_id)` → duplicate deliveries are detected, not reprocessed
- `payload JSONB` + `signature_valid` — audit trail
- `processed_at` / `processing_error` — processing outcome

### `service_subscriptions`

What the user actually gets. One row per successful activation.

- `payment_intent_id` **unique** — the idempotency anchor: one payment can ever grant
  at most one subscription
- `expires_at` — active while in the future; renewal extends from the current expiry
- Indexes `(userId, service, expiresAt)` and `(userId, service, accountType, expiresAt)`
  for the "find active subscription" lookup

## Payment status state machine

```
                 ┌────────────────────────────── terminal ──────────────────────────┐
                 │                                                                  │
 CREATED ──► AWAITING_USER ──► SUCCEEDED ──► [subscription created]
    │            │    ▲
    │            │    └── RECONCILING (future)
    ▼            ▼
 UNKNOWN      FAILED / CANCELLED
 (provider     (provider rejected, or user declined on phone)
  unreachable)     │
    │              └── user retries → brand-new PaymentIntent
    └── past expires_at ──► EXPIRED

 PENDING (provider-facing)  = CREATED | PROVIDER_REQUESTED | AWAITING_USER | UNKNOWN | RECONCILING
 TERMINAL                   = SUCCEEDED | FAILED | EXPIRED | CANCELLED
```

Provider statuses (`PENDING/SUCCEEDED/FAILED/CANCELLED/UNKNOWN`) are normalized to
internal statuses by `providerStatusToPaymentStatus()` in `domain/payment.ts`.
Public API only exposes `pending | succeeded | failed | cancelled | expired | unknown`
via `toPublicPaymentStatus()`.

## Flow 1 — initiate a payment (`POST /v1/payments`)

```
client → POST /v1/payments {account_type, installment_id, payment_method, phone_number}
         + optional Idempotency-Key header (8–120 chars)
  │
  ├─ normalize phone (Rwanda, +25…) & derive/validate method:
  │    078/079 → mtn_momo, 072/073 → airtel_money (must match request)
  ├─ load plan: must be active, match account_type, currency RWF, price > 0
  │
  ├─ dedupe:
  │    a) idempotency key set → return existing intent (409 if payload differs)
  │    b) no key → reuse newest PENDING intent for same user+plan+method
  │       created within 15 min (PAYMENT_REUSE_WINDOW_MINUTES) and not expired
  │
  ├─ create PaymentIntent (reference = nextval → PAY-<n>, status CREATED,
  │                       expires_at = now + 10 min)   [catches P2002 race → dedupe]
  │
  ├─ provider.requestPayment({reference, amountMinor, currency, method, phone})
  │    ├─ throws → intent := UNKNOWN, return 502 PAYMENT_PROVIDER_UNAVAILABLE
  │    │           (status must be checked before any retry — never blind-retry)
  │    ├─ SUCCEEDED (instant) → intent := PROVIDER_REQUESTED → activation (flow 4)
  │    │                          → response: payment completed
  │    └─ PENDING → intent := AWAITING_USER, message = "approve the prompt on your phone"
  │
  └─ respond: payment_id (reference), public status, expires_at, message
```

Client instruction text comes from `paymentInstruction()` — the user must approve a
prompt pushed to their phone by the operator.

## Flow 2 — poll status (`GET /v1/payments/:id/status`)

`id` accepts either the UUID or the `PAY-<n>` reference (resolved by
`findPaymentByIdentifier`). Only the owning user can read it (404 otherwise).

```
terminal status?  → return as stored, no provider call
else:
  provider.getStatus({reference, providerTransactionId})
    ├─ call fails → return stored status (poll again later)
    ├─ SUCCEEDED  → activate (flow 4) → return final state
    └─ otherwise  → map provider status; if now ≥ expires_at
                    and status ∈ {AWAITING_USER, UNKNOWN} → EXPIRED
```

## Flow 3 — webhook (`POST /v1/payments/webhook`, public route)

The authoritative, asynchronous confirmation path.

```
provider → POST /v1/payments/webhook (JSON body)
  │
  ├─ verify HMAC: sha256=<hex> of raw body vs PAYMENT_WEBHOOK_SECRET
  │   (raw body captured by Fastify `rawBody: true` in main.ts; timing-safe compare)
  │   invalid → 401
  │
  ├─ find intent by payment_id (reference)
  ├─ record event in provider_webhook_events (unique provider+event_id)
  │    already processed duplicate → {received: true, duplicate: true}, 200
  │
  ├─ guards: amount_minor and currency, when present, must match the intent
  │
  ├─ status:
  │    succeeded  → intent := PROVIDER_REQUESTED → activate (flow 4)
  │    failed/cancelled/pending/unknown → update intent accordingly
  │                  (skipped if already SUCCEEDED; a terminal intent is not
  │                   downgraded back to pending by a late duplicate event)
  │
  └─ mark event processed_at (+ processing_error on failure, rethrown)
```

## Flow 4 — activation (on confirmed success)

`PaymentActivationService.activate()` → `PaymentRepository.activateSubscription()`:

```
prisma.$transaction:
  1. subscription already exists for this payment_intent_id?
        → idempotent: just re-mark intent SUCCEEDED, return existing
  2. find user's current active FINDLOVE subscription (expires_at > now)
  3. expires_at = current_expiry + plan.duration_days   (stacks renewal time)
  4. create ServiceSubscription {service: FINDLOVE, accountType: plan.accountType,
                                  installmentPlanId, paymentIntentId, expiresAt}
  5. update intent → SUCCEEDED, paid_at = now, failure_reason = null
then: AccountTypeService.setFindLoveProfileType(userId, plan.accountType)
        → sets the user's LoveProfileType so the app behaviour follows the paid plan
```

The unique index on `service_subscriptions.payment_intent_id` plus a P2002 catch makes
activation idempotent even when webhook and status poll fire concurrently.

## Flow 5 — subscription read / account switch

- `GET /v1/findlove/subscription` — current profile type + latest active subscription
  (`findActiveSubscription`: service FINDLOVE, `expires_at > now`, order by expiry desc)
  with days remaining.
- `PATCH /v1/findlove/account-type` — switching between `private`/`public` is blocked
  (409) while a subscription of the **other** type is still active; the user must pay
  the other account type's installment instead.

## API endpoints summary

| Method | Path                          | Auth    | Purpose                                            |
| ------ | ----------------------------- | ------- | -------------------------------------------------- |
| GET    | `/v1/installments`           | public  | List active plans (filter `account_type`)         |
| POST   | `/v1/payments`                | user    | Initiate collection (supports `Idempotency-Key`)   |
| GET    | `/v1/payments/:id/status`    | owner   | Poll, reconcile via provider, expire stale        |
| POST   | `/v1/payments/webhook`        | none    | Signed provider callback                           |
| GET    | `/v1/findlove/account-types` | public  | Static catalogue                                   |
| GET    | `/v1/findlove/subscription`  | user    | Current subscription state                         |
| PATCH  | `/v1/findlove/account-type`   | user    | Switch profile type (guarded by active sub)        |
| GET    | `/v1/admin/payments`         | admin   | Paginated payments, filters status/type/method    |
| GET/POST/PATCH | `/v1/admin/installments` | admin | Plan CRUD, activate/deactivate                     |

## Key invariants and rules

- **One intent → at most one subscription** (unique FK) and **one reference per intent**
  — activation and webhook handling are idempotent under concurrency.
- **`UNKNOWN` means money state is unknown** — never auto-retry it. See
  [the stuck-payment runbook](../runbooks/payment-stuck.md). The provider's
  `getStatus()` is the only authority.
- Amounts are `BigInt` minor units end to end; on the wire they are strings
  (`toWire` / `moneyWire`), never JSON numbers.
- Money is single-currency today: `RWF` via MTN MoMo (`078/079`) or Airtel Money
  (`072/073`), enforced by prefix check `paymentMethodForPhone()`.
- Expiry: intents die after 10 minutes; unconfirmed intents are reused for 15 minutes
  to avoid duplicate prompts to the same phone.
- Webhooks must be HMAC-SHA256 signed with `PAYMENT_WEBHOOK_SECRET` over the raw body;
  the fake provider skips verification for local development only.

## Environment

| Variable                   | Meaning                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `PAYMENT_PROVIDER`         | `fake` (default, dev) or `aggregator` (real HTTP provider)     |
| `PAYMENT_PROVIDER_BASE_URL`| Aggregator base URL (Bearer-auth REST calls, 15s timeout)       |
| `PAYMENT_PROVIDER_API_KEY` | Aggregator API key                                              |
| `PAYMENT_WEBHOOK_SECRET`   | HMAC secret; required when `aggregator` is selected            |
