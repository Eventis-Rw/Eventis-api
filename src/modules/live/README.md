# Live directory (development)

A shared directory for the mobile app's event-focused Live flow. LiveKit carries media; this module coordinates discoverable sessions and queue places. Contracts are in `src/contracts/live.ts`. Identity, verified eligibility, production token grants and payments are not implemented by this module.

## Enable locally

Set `LIVE_DEVELOPMENT_ACCESS=true` in the local API `.env`, build the API, and start the existing Redis service. Access is disabled by default and refused outside development/test. Development mode intentionally allows repeated test sessions; it does not claim to verify genuine views, account age, organiser approval or daily eligibility.

## Endpoints

All paths are under `/api/v1/live`:

- `GET /rooms`: active broadcast listings and capacity.
- `POST /rooms`: idempotently reserve a room or enter the FIFO queue.
- `POST /rooms/:id/watch`: resolve an active listing into its transport session.
- `POST /rooms/:id/heartbeat`: publish/renew a host-owned listing and viewer count.
- `DELETE /rooms/:id`: unregister a host-owned reservation or broadcast.
- `POST /queue/:id/poll`: renew a queue ticket and return its position/readiness.
- `POST /queue/:id/claim`: explicitly claim the first available queue place.
- `DELETE /queue/:id`: cancel a queue place.

The host/queue control token goes in the Authorization header. Public listings and watch responses never include it. Private start-operation IDs are distinct from public listing and transport IDs. Redaction uses the existing API logger. Profiles and linked-event metadata are bounded and validated; device-local image paths are not shared as thumbnails.

## Lifecycle and limits

Redis compare-and-set updates protect the five-room limit across concurrent API processes. Preparing sessions reserve capacity without appearing in discovery. A connected host renews a 60-second lease and publishes its listing. Sessions have an absolute 30-minute expiry. Queue tickets expire after 90 seconds without polling; claiming never starts a camera automatically. The store is isolated under `eventis:live:development-directory:v1` and expires inactive data.

Use the production identity and event modules to replace client-supplied test identity/metadata before enabling public hosting. Replace the open development token server with authenticated, scoped LiveKit grants and provider lifecycle callbacks. The API capacity limit applies to API-managed sessions; it cannot constrain clients bypassing this directory with an open development token service. No wallet, payment or payout state is touched.
