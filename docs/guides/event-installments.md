# Event installments module — how it works

The `event-installments` module lets organisers offer **pay-in-installments** for
event tickets/services. It is a purpose (`EVENT_INSTALLMENT`) on top of the existing
`payments` module: money is still collected with mobile money through
`PAYMENT_GATEWAY`, never stored in a wallet, and every provider call stays inside the
payments module.

Source: `src/modules/event-installments/`

> FindLove subscriptions are a *different* purpose (`FINDLOVE`) handled by the
> `payments` module. This module does not touch FindLove plans or flows.

## Module structure

```
event-installments/
├── api/
│   ├── admin-event-installments.controller.ts   /v1/admin/event-installments/*  (role: admin)
│   ├── event-installments.controller.ts         /v1/event-installments/*        (authenticated)
│   └── dto/event-installments.dto.ts            Zod validation (snake_case wire)
├── application/
│   ├── installment-plans.service.ts             plan templates (admin CRUD)
│   ├── installment-preview.service.ts           schedule preview without persisting
│   ├── installment-agreements.service.ts        assign / custom / list / revise / status
│   ├── installment-payments.service.ts          initiate, status, manual, completion hook
│   ├── installment-refunds.service.ts           request → complete / reject
│   ├── installment-late-fees.service.ts         apply / waive / list
│   ├── installment-overdue.service.ts           idempotent overdue sweep
│   ├── installment-notifications.service.ts     reminders + notification log
│   ├── installment-schedules.service.ts         schedule list / due-date / waive
│   ├── installment-reports.service.ts           summary / recent / upcoming / audit
│   └── installment-completion.registrar.ts      registers the EVENT_INSTALLMENT handler
├── domain/                                      pure rules, no I/O, no framework
│   ├── installment-plan.ts                      plan terms, initial payment, late fee math
│   ├── installment-calculation.ts               schedule generation, balances (BigInt)
│   ├── installment-agreement.ts                 status machine, reconciliation
│   └── installment-payment.ts                   payment/refund/notification types
├── infrastructure/installment.repository.ts     Prisma persistence + CAS credit
├── mappers/installment.mapper.ts                domain → wire (BigInt → string)
├── event-installments.module.ts
└── index.ts                                     the only cross-module entry point
```

## Prisma schema

Migrations: `prisma/migrations/20261110220440_event_installments/` and
`..._event_installments_schedule_initial_flag/`.

```
EventInstallmentPlan 1───n EventInstallmentAgreement 1───n EventInstallmentSchedule
                              │                                  │
                              ├───n EventInstallmentPayment ──────┘
                              │          └───n EventInstallmentRefund
                              ├───n EventInstallmentLateFee
                              ├───n EventInstallmentNotification
                              └───n EventInstallmentAuditLog
```

`EventInstallmentPayment` also references the `PaymentIntent` created by the payments
module (`payment_intent_id`). `PaymentIntent.purpose` is `EVENT_INSTALLMENT` and
`PaymentIntent.referenceId` is the installment payment id.

Schedule row #1 is the **initial payment** (`isInitialPayment = true`) and is due on the
agreement `startDate`; the remaining `installmentCount` rows follow the plan frequency.

## Money rules

- All amounts are `BigInt` minor units (RWF has exponent 0). Wire values are strings.
- Interest is **simple**: `floor(financed * interestRateBps / 10_000)`, applied to the
  financed principal (`total - initialPayment`).
- Per-installment amounts are floored; the **remainder goes to the last installment**
  so the schedule reconciles exactly to the payable total.
- Late fees: `FIXED` (minor units) or `PERCENT` (`floor(amountDue * bps / 10_000)`).
- No float arithmetic anywhere. `scripts/guard-money.sh` covers this module too.

## Agreement lifecycle

```
DRAFT ─▶ ACTIVE ─▶ COMPLETED
          │  ▲
          ▼  │
       OVERDUE
          │
          ▼
      SUSPENDED ─▶ CANCELLED
```

Status is **derived from schedules** during reconciliation (`refreshAgreement`): all open
schedules paid → `COMPLETED`; any overdue → `OVERDUE`; otherwise `ACTIVE`. Terminal states
(`COMPLETED`, `CANCELLED`) never reopen. Only `ACTIVE` agreements accept payments.

### Revision

`POST agreements/:id/revise` regenerates the schedule **only when nothing has been paid**
(`amountPaidMinor === 0n`) and the agreement is not terminal. It regenerates from the
stored interest snapshot — it never reconstructs a rate with floats. Once money has moved,
revision returns `409`; cancel and recreate instead.

## Payment flow

```
customer → POST /v1/event-installments/agreements/:id/schedules/:scheduleId/payments
  1. validate ownership + agreement ACTIVE + schedule payable + amount ≤ outstanding
     (partial and early payments must be allowed by the agreement)
  2. reuse a PENDING attempt for the same schedule+method from the last 15 min,
     reconciling it with the provider via collections.checkStatus
  3. create EventInstallmentPayment (source PROVIDER)
  4. collections.initiate({ purpose: "EVENT_INSTALLMENT", referenceId: payment.id })
  5. link payment_intent_id, mirror synchronous SUCCEEDED
```

Confirmation arrives from the payments module (webhook or status poll) and is dispatched
to the handler registered by `InstallmentCompletionRegistrar`:

```
PaymentCompletionRegistry (purpose EVENT_INSTALLMENT)
  → InstallmentPaymentsService.handlePaymentSucceeded
      → repository.applyConfirmedCollection  (compare-and-swap on status)
```

`applyConfirmedCollection` updates the schedule/payment only when the payment is still in
`PENDING`/`FAILED`/`CANCELLED`, so a webhook and a poll confirming the same intent can
**never double-credit**. Balances are then recomputed from schedule rows, never incremented
blindly.

### Manual payments

Money received outside the platform (cash, bank transfer) is recorded by an admin with a
required `transaction_reference` and `reason`; it writes an audit log and credits the
schedule immediately.

## Refunds

The aggregator exposes **no refund API**, so refunds are honest and manual:

```
REQUESTED ──complete (requires provider_refund_reference)──▶ COMPLETED
     └──────reject (requires rejection_reason)─────────────▶ REJECTED
```

Completing a refund reopens the schedule's outstanding balance and recalculates payment /
agreement status. Nothing reports a fake provider success.

## Overdue, late fees, notifications

There is no scheduler infrastructure in this codebase, so these are **idempotent
admin-triggered sweeps**:

- `POST overdue-sweep` — marks schedules past due date + grace period as `OVERDUE`,
  sets agreements to `OVERDUE`, and queues reminder notifications (deduped).
- `POST late-fees` — applies a late fee once per overdue schedule (deduped).
- `POST notifications/reminders` — queues due-date reminders.
- Notifications are persisted as `PENDING` in `EventInstallmentNotification`. There is
  **no SMS/email provider wired**, so nothing is auto-sent; an admin marks a notification
  sent (`POST notifications/:id/sent`). This is deliberate — the module never pretends to
  deliver a message it cannot send.

## Endpoints

### Customer (`/v1/event-installments`, authenticated)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `agreements` | my agreements (optional `event_id`) |
| GET | `agreements/:id` | one agreement (owner or event poster) |
| GET | `agreements/:id/schedules` | schedule rows |
| POST | `agreements/:id/schedules/:scheduleId/payments` | start a collection (`Idempotency-Key`) |
| GET | `payments` | my payments (optional `agreement_id`) |
| GET | `payments/:id/status` | reconcile one payment with the provider |
| GET | `notifications` | my notifications |

### Admin (`/v1/admin/event-installments`, role `admin`)

| Method | Path | Purpose |
| --- | --- | --- |
| GET/POST | `plans`, `plans/:id`, `plans/:id/status` | plan templates |
| POST | `preview` | preview a schedule for a plan + total |
| POST | `agreements` | assign a plan to an event/customer |
| POST | `agreements/custom` | one-off agreement terms |
| GET | `agreements`, `agreements/:id` | list / inspect |
| POST | `agreements/:id/revise`, `agreements/:id/status` | revise / transition |
| GET | `agreements/:id/schedules` | schedule rows |
| POST | `schedules/:id/due-date`, `schedules/:id/waive` | adjust / waive |
| POST | `payments/manual` | record cash/bank payment (audited) |
| GET | `payments`, `payments/:id` | list / inspect payments |
| POST | `refunds`, `refunds/:id/complete`, `refunds/:id/reject` | refund workflow |
| GET | `refunds`, `refunds/:id` | refund list / inspect |
| POST | `late-fees`, `late-fees/:id/waive` | apply / waive late fee |
| GET | `late-fees` | list late fees |
| POST | `overdue-sweep`, `notifications/reminders` | idempotent sweeps |
| GET | `notifications`, POST `notifications/:id/sent` | notification log |
| GET | `reports/summary`, `reports/recent-payments`, `reports/upcoming-schedules` | reporting |
| GET | `audit-logs` | audit trail |

## Tests

- `domain/installment-calculation.test.ts` — interest, rounding/remainder, monthly
  clamping (incl. leap years), balances.
- `domain/installment-agreement.test.ts` — status machine, reconciliation, early/overdue.
- `application/installment-payments.service.test.ts` — validation, reuse path, CAS
  double-credit protection, manual payment audit, status mirroring.

Run with `bun test src/modules/event-installments`.

## Honest limitations

- No provider refund API → refunds are completed manually with a reference.
- No SMS/email provider → notifications are stored and marked sent by an admin.
- No scheduler → overdue/late-fee/reminder jobs are admin-triggered, idempotent sweeps.
