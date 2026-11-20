# Admin backend integration

The frontend branch is `feat/admin-api-integration`. The backend branch is
`feat/admin-frontend-integration`, based on `origin/feature/event-installment` (`0f069f5`).
The existing dashboard layouts are retained; API mode replaces demo persistence with server actions
and admin-guarded backend contracts. The original backend dev checkout was left untouched.

## Local setup

Frontend: Node >=20.9, `npm ci`, then set these **server-only** values in `.env.local`:

```dotenv
DATA_SOURCE="api"
API_BASE_URL="http://localhost:4000"
```

Start the matching backend first, then `npm run dev`. Use an existing active ADMIN account's phone
and PIN. Mock-mode credentials cannot log in to the real backend. Keep existing `.env.local` secrets;
do not overwrite the file. Switching back to `DATA_SOURCE="mock"` restores the standalone demo.
No demo browser records are imported into the live database.

Backend source is at `/home/nzizaprince/Documents/code/Eventis-api-admin-integration`.
The backend needs Node, Bun, PostgreSQL/PostGIS and Redis. Its unpublished shared packages come
from `Eventis-Rw/Eventis-contracts`; follow `docs/guides/local-setup.md` in the backend to build/link
`@eventis/contracts`, `@eventis/tsconfig` and `@eventis/eslint-config`. Configure that backend's `.env`
using its example and generated keys. Never copy the integration-test `.env` into production.
Apply migrations with `bun run db:migrate`, generate Prisma and build before starting the API.
Review the migrations against existing production data before deployment.

This machine's dependency cache currently lives in `/tmp/eventis-api-admin-integration/node_modules`
and is linked into the permanent backend worktree to avoid duplicating it. The contracts and isolated
Bun cache also live under `/tmp`. Source changes are in the permanent worktree; after temporary files
are cleared, repeat the documented backend dependency setup. Neither repository commits caches or secrets.

## Contracts and behavior

All paths below are relative to `/api/v1`. Reads and writes require a current, active admin account;
backend guards check current database role/status, including for previously issued tokens.

| Screen | Backend contract | Persistence |
|---|---|---|
| Eventis plans | GET/PUT `/admin/organiser-catalog` | OrganiserPlan + catalog settings |
| Eventis installments | GET `/admin/installment-workspace`, POST `.../commands` | EventInstallmentPlan/Agreement/Schedule/Payment/Refund/LateFee/Notification |
| FindLove membership screens | GET `/admin/findlove-workspace`, POST `.../commands` | InstallmentPlan, ServiceSubscription, PaymentIntent, users, verification and reports |
| FindLove photos | GET `/admin/findlove/photos`, PATCH `.../:id` | LoveProfilePhoto moderation + audit |
| FindLove support | GET `/admin/findlove/support`, POST `.../:id` | SupportReport + normalized replies/notes + in-app notification |
| FindLove staff | GET `/admin/findlove/staff` | Actual ADMIN users; one full administrator role |
| FindLove notifications | GET `/admin/findlove/notifications`, POST `.../:id/preview` | Template drafts and admin-only in-app preview |
| Eventis reports | GET `/admin/reports`, PATCH `.../:id` | Native event reports + reviewer/audit |
| Eventis audit | GET `/admin/audit-logs` | Actual AuditLog records |

Catalog/workspace writes carry a revision. A stale write returns 409; reload before retrying.
Workspace commands also carry a stable UUID request ID. A replay with the same payload does not
repeat the mutation; reusing that ID for another command is rejected. Mutations and audit writes
are transactional. Money persists as integer minor units; JSON amounts follow the existing UI's
currency precision. RWF is a whole-franc currency. Reports do not combine unlike currencies.

An organiser agreement snapshots its product price and terms. Later price edits do not reprice
existing agreements or pending native organiser purchases. Revisions preserve receipts and
reschedule the outstanding balance without charging interest again. Refunds reopen balances;
cancellation stops collection. The admin organiser workspace shares canonical installment tables
with legacy event-ticket financing, but each contract reads its own agreement type.

FindLove uses full-period membership purchases, not installment schedules. Public/Private plans,
7/30/365-day periods, verification, age/country and saved connection permissions control access.
Same-tier early renewals retain remaining days and purchased permissions. Revoke active access
before switching tiers. Complimentary grants/extensions create no revenue. Grants create separate entitlement records so earlier paid purchase terms remain intact.

The live payment dialog **records an external payment**. Enter the provider/bank transaction reference
in its existing reason field (labelled Transaction reference in live mode). References are unique
case-insensitively. Pending/failed records grant no access. Confirming an admin-recorded pending
receipt uses its original price/duration quote and activates/extends membership. Manual entries
never call a payment gateway, are excluded from gateway reuse/polling, and cannot be settled by
webhooks. Gateway-created payments must be confirmed through their own provider flow.

Support replies save a real staff identity and create a member in-app notification. Internal notes
are excluded from customer endpoints. Photo approval controls discovery; existing photos are
preserved as approved when migrated and new photos enter review. Owners can see their own submissions.
Staff lists reflect the backend's single ADMIN role, not invented specialized permissions.

## Limits

- No Mobile Money charge or external refund is initiated by these admin actions.
- Installment reminders are pending records. SMS/email delivery workers are not connected.
- FindLove templates are drafts and previews only; automated scheduling and external delivery
  confirmations are not implemented. Delivery rates show N/A instead of simulated percentages.
- Mobile source is unchanged. It must consume the shared organizer catalog to present every
  bundle/payment option. Admin installment receipts do not automatically grant organizer posting access.
- A native bookings/orders/tickets ledger is absent. The existing bookings gap view remains.
- General event editing, specialized staff roles and additional account/settings controls are not
  introduced by this integration. Existing read-only screens remain read-only.
- Workspace reads currently return complete working sets, and audit lists are capped at 2,000 entries;
  pagination is a follow-up before large-scale use.

## Verification with limited resources

Run one command at a time. No browser or full Next production build is required for focused checks:

```bash
NODE_OPTIONS=--max-old-space-size=512 npx tsc --noEmit
NODE_OPTIONS=--max-old-space-size=512 npm run lint
npm run test:plans
npm run test:installments
npm run test:findlove
```

Backend: capped TypeScript build/typecheck, `bun test src`, `bun run guard:money`, and the admin HTTP
integration suites. Integration tests are opt-in with `RUN_ADMIN_INTEGRATION=1` and explicitly refuse
any database other than `127.0.0.1:55437/eventis_admin_integration`; the API must run on port 4001
against that database. They exercise real migrations, authentication, permissions, exact prices,
repayment lifecycle, receipt settlement and duplicate/stale writes. Stop the isolated API and test
Postgres/Redis containers when done. Do not run these mutation tests against shared data.

Verified on this integration branch: 43 frontend domain tests, 163 backend unit tests and 19
focused HTTP/database scenarios passed, along with frontend lint, backend compilation, the
money guard and capped TypeScript checks. A lightweight backend lint run (type-aware rules and
recursive import-cycle lint disabled) passed. Full backend lint exceeded the 512 MB heap cap;
its type-aware result remains unverified. Dependency-cruiser reports the same 12 violations on
the untouched backend baseline and the integration branch; this integration adds none. These
baseline type-import/layering findings remain to be resolved. The latest UI flows were not rerun
in a browser and no final Next production build was run, to keep this machine's resource use low.
The isolated test API and both test containers were stopped after verification.

## Local testing with the supplied backend environment

The saved `../Eventis-api/.env` was validated and used to initialize the dedicated local development
database `eventis_api_dev` on localhost:5433. The integration backend runs on port 4000 during
manual testing; the dashboard runs on localhost:3000. Frontend `.env.local` now selects API mode.
The backend's saved environment file remains unchanged. SMS is overridden to `fake` in the test
process, and the payment provider is fake.

All 28 migrations applied successfully to this newly provisioned database. All 19 integration
scenarios passed against it. HTTP checks also passed for the login page, live Eventis pricing and
live FindLove payments. Submitting the actual dashboard login form returned a redirect to Eventis
and issued both httpOnly session cookies. This verifies server rendering and login; no automated
browser or production build was used.

Local test administrator: `+250788000001`, PIN `12345`. These credentials belong only to the
local fixtures. Automated tests created sample members, payments and history in this new database.
The original catalog and connection-rule defaults were restored after the tests' deliberate edits.

The local services use dedicated Docker volumes. PostgreSQL is capped at 384 MB / 0.5 CPU; Redis
at 64 MB / 0.25 CPU. To stop them when finished:

```bash
docker stop eventis-admin-dev-db eventis-admin-dev-redis
```

To restart later, start those two containers and run the integration backend from its own checkout:

```bash
docker start eventis-admin-dev-db eventis-admin-dev-redis
cd /home/nzizaprince/Documents/code/Eventis-api-admin-integration
PORT=4000 SMS_PROVIDER=fake node --max-old-space-size=256 --env-file=../Eventis-api/.env dist/main.js
```

In another terminal, run the dashboard with a capped heap:

```bash
cd /home/nzizaprince/Documents/code/eventis-admin
TEST_LOGIN_BYPASS=false NODE_OPTIONS=--max-old-space-size=512 npm run dev -- --webpack --hostname 127.0.0.1
```

Dependencies and the backend build must exist before those commands. API/backend source changes
still reside on the separate integration branch; the original backend dev checkout was not modified.
