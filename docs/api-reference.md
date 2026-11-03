# Eventis API reference

The interactive Swagger UI is served at `http://localhost:3000/docs`; its OpenAPI JSON is at `http://localhost:3000/openapi.json`. Regenerate the checked-in specification with `bun run openapi`.

## Run locally

1. Copy `.env.example` to `.env`, set the required database, Redis, JWT, ticket signing and storage values, then start the local dependencies and apply the Prisma migrations.
2. Run `bun run dev` from this repository.
3. Open `/docs`, choose **Try it out**, edit the example payload and execute the request. The default API port is `3000`.

Swagger UI loads its presentation bundle from `unpkg.com`, so the UI needs an internet connection. The JSON specification remains available directly at `/openapi.json` and can also be imported into Postman or another OpenAPI client.

## Authentication test flow

1. Call `POST /api/v1/auth/signup` with `phone`, `username`, and a five-digit `pin`. `accountType` is optional and defaults to `CUSTOMER` (`POSTER` is also supported).
2. Read the six-digit code from the SMS provider configured in `.env`. `SMS_PROVIDER=fake` records messages only in memory and deliberately does not log the OTP, so it cannot complete an interactive HTTP signup flow. For a real phone test, configure Africa's Talking sandbox; for automated checks, the fake provider is inspectable by the test harness.
3. Call `POST /api/v1/auth/signup/verify-otp` with `phone` and the six-digit `code`. The response contains `tokens.accessToken` and `tokens.refreshToken`.
4. For login, send `phone` and the five-digit `pin` in the request body. No device headers or device credentials are used.
5. In Swagger UI, click **Authorize** and paste the access token (without adding `Bearer `). Then try `GET /api/v1/auth/me`, `PATCH /api/v1/users/me`, and `POST /api/v1/auth/logout`.

## Route inventory

| Method | URL                                      | Authentication      |
| ------ | ---------------------------------------- | ------------------- |
| GET    | `/healthz`                               | No                  |
| GET    | `/readyz`                                | No                  |
| POST   | `/api/v1/auth/request-otp`               | No                  |
| POST   | `/api/v1/auth/login`                     | No                  |
| POST   | `/api/v1/auth/signup`                    | No                  |
| POST   | `/api/v1/auth/signup/send-otp`           | No                  |
| POST   | `/api/v1/auth/signup/verify-otp`         | No                  |
| POST   | `/api/v1/auth/verify-otp`                | No                  |
| POST   | `/api/v1/auth/refresh`                   | No                  |
| POST   | `/api/v1/auth/logout`                    | Bearer access token |
| GET    | `/api/v1/auth/me`                        | Bearer access token |
| PATCH  | `/api/v1/users/me`                       | Bearer access token |
| GET    | `/api/v1/installments`                   | No                  |
| POST   | `/api/v1/payments`                       | Bearer access token |
| GET    | `/api/v1/payments/{id}/status`           | Bearer access token |
| POST   | `/api/v1/payments/webhook`               | Provider signature  |
| GET    | `/api/v1/findlove/account-types`         | No                  |
| GET    | `/api/v1/findlove/subscription`          | Bearer access token |
| PATCH  | `/api/v1/findlove/account-type`          | Bearer access token |
| GET    | `/api/v1/admin/payments`                 | Admin               |
| GET    | `/api/v1/admin/installments`             | Admin               |
| POST   | `/api/v1/admin/installments`             | Admin               |
| PATCH  | `/api/v1/admin/installments/{id}`        | Admin               |
| PATCH  | `/api/v1/admin/installments/{id}/status` | Admin               |

## Image upload test flow

Image-changing operations use `multipart/form-data` and expose a Swagger file
picker:

- `POST /api/v1/events` — upload the optional `cover_image` file with event fields.
- `PUT` or `PATCH /api/v1/events/{id}` — upload an optional replacement `cover_image`.
- `PATCH /api/v1/users/me` — upload an optional `avatar_image` file with profile fields.

In Swagger, click **Try it out**, choose a local file, and execute the request.
In Postman, choose **Body → form-data**, enter the other fields as text, set
`cover_image` or `avatar_image` to **File**, and select the image. JPEG, PNG,
and WebP files up to 5 MiB are validated. The configured storage provider
uploads the bytes, and the generated URL is returned in the event
`cover_image` or profile `avatarUrl` response field.

## Chat and messaging

All `/api/v1/chat/*` routes require `Authorization: Bearer <access-token>`.
Contact matching accepts up to 200 entries at `POST /api/v1/chat/contacts/sync`;
it returns registered matches and invite actions without retaining submitted
contact names or phone numbers. The mobile app must request address-book access
itself and should keep unmatched contacts locally. Contact matching is limited
to 10 requests per user per minute.

Create or retrieve a direct conversation with `POST /api/v1/chat/conversations`
and `{"userIds":["<other-user-uuid>"],"service":"EVENTIS","type":"DIRECT"}`.
`service` accepts `FINDLOVE` or `EVENTIS`; if omitted it defaults to `EVENTIS`.
Direct pairs are unique within a service, so the same people can have separate
conversations in FindLove and Eventis. For Eventis event messaging, pass the
event UUID as `contextId`; the default policy allows an organizer to start a
conversation with a registered attendee for the same published event. The
FindLove policy allows compatible profile types and creates a pending
connection request. To create a self-conversation, use your own user ID as the
only `userIds` entry. You cannot include yourself in a group or alongside
another user. Groups need at least two other user IDs and may include a title.
Use `GET /api/v1/chat/conversations?service=EVENTIS` for the paginated inbox;
the service filter defaults to `EVENTIS`. Add `archived=true` for archived
conversations. `PATCH /api/v1/chat/conversations/{id}/settings` accepts
`isArchived` and/or `isMuted`.

Use `GET /api/v1/chat/conversations/{id}/messages?limit=50` for stable,
chronological pages. Pass the response `nextBeforeId` as `beforeId` for the
previous page. Send text with `POST /api/v1/chat/conversations/{id}/messages`;
the sender comes from the access token. `clientMessageId` makes retries
idempotent. Replies use `replyToId`; senders may edit or soft-delete their own
messages. Mark delivery at
`PATCH /api/v1/chat/conversations/{id}/receipts/delivered` with an optional
`messageId`, and mark a conversation read at
`PATCH /api/v1/chat/conversations/{id}/read`.

Upload one attachment using multipart field `file` at
`POST /api/v1/chat/conversations/{id}/messages/attachments`. The maximum size
is 15 MiB; allowed MIME types are JPEG/PNG/WebP, PDF, text, Word documents and
audio formats. Files are stored privately and downloads at
`GET /api/v1/chat/attachments/{id}/content` require conversation membership.
Audio uploads become `VOICE` messages. Storage uses the existing
`STORAGE_ENDPOINT`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY_ID` and
`STORAGE_SECRET_ACCESS_KEY` configuration.

Invitations are created with `POST /api/v1/chat/invitations`; a 72-hour
single-use deep link is returned for the mobile app to share through SMS or its
native share UI. Only the registered account with the invited verified phone
can accept it via `POST /api/v1/chat/invitations/accept`. No invitation SMS
provider integration is configured by this backend.

Calls are initiated with `POST /api/v1/chat/calls`, transitioned with
`PATCH /api/v1/chat/calls/{id}`, and listed at
`GET /api/v1/chat/calls/history?service=EVENTIS`. Calls use the conversation's
service policy. Call history and signaling are implemented;
the media stream itself requires a WebRTC-capable mobile client and compatible
network/STUN/TURN configuration. Signaling uses Socket.IO at `/socket.io` with
the JWT in `auth.token` during connection. It supports:

| Client event              | Payload                                            | Purpose                                                   |
| ------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| `chat:conversation:join`  | `{"conversationId":"<uuid>"}`                      | Join after server membership validation                   |
| `chat:conversation:leave` | `{"conversationId":"<uuid>"}`                      | Leave a validated conversation room                       |
| `chat:message:send`       | `{"conversationId":"<uuid>","content":"Hi"}`       | Send text; persisted before broadcast                     |
| `chat:receipt:delivered`  | `{"conversationId":"<uuid>","messageId":"<uuid>"}` | Confirm delivery                                          |
| `chat:receipt:read`       | `{"conversationId":"<uuid>"}`                      | Mark read                                                 |
| `chat:call:signal`        | `{"callId":"<uuid>","signal":{...}}`               | Forward an authorized WebRTC offer, answer or ICE payload |

Server events include the conversation `service` in message, receipt, call,
and signaling payloads so clients can route them to the correct service. Events
include `chat:message:new`, `chat:message:updated`, `chat:message:deleted`,
`chat:receipts:delivered`, `chat:receipts:read`,
`chat:call:incoming`, `chat:call:updated`, and `chat:call:signal`.
Acknowledged client operations respond with `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": "<stable error code>" }`. Reconnect recovery uses the
persisted message-history endpoint. Realtime presence/rate-limit state is
process-local; horizontally scaled deployments need a shared Socket.IO adapter
and distributed rate limiter.

The generated OpenAPI document lists all chat HTTP endpoints and schemas.
WebSocket event names and payload descriptions are maintained in this section.
Block a user with `POST /api/v1/chat/blocks` and `{"userId":"<uuid>"}`;
either direction of a block prevents messaging. Report a user with
`POST /api/v1/chat/reports` and `{"userId":"<uuid>","reason":"..."}`;
`conversationId` and `details` are optional. FindLove policy errors include
`PROFILE_INCOMPATIBLE`, `SUBSCRIPTION_REQUIRED`, `PENDING_LIMIT_REACHED`,
`REQUEST_NOT_ACCEPTED`, and `BLOCKED`. Eventis association failures use
`EVENT_ASSOCIATION_REQUIRED`. Socket acknowledgements return these stable
codes in the `error` field, and REST errors use the standard error envelope.

Existing conversations are backfilled as `EVENTIS` by
`prisma/migrations/20261021160000_shared_messaging_context`; this preserves
their messages and old direct pairs. Apply pending migrations with
`bun run db:migrate` before serving chat routes. Invitation URLs use
`MOBILE_APP_SCHEME` (default `mobile`) and require a matching deep-link route
in the mobile application.

## FindLove installments and mobile money

FindLove subscriptions are paid directly with MTN Mobile Money or Airtel Money.
There is no wallet, token balance or client-supplied amount. The payable amount
always comes from the selected admin-managed installment plan.

1. `GET /api/v1/installments?account_type=private` lists active plans. Prices
   are integer minor-unit strings; RWF uses zero decimal places.
2. `POST /api/v1/payments` with `account_type`, `installment_id`,
   `payment_method` (`mtn_momo` or `airtel_money`) and `phone_number` starts a
   collection. Send an `Idempotency-Key` header (8–120 characters) so retries
   return the same payment instead of creating another one.
3. `GET /api/v1/payments/{id}/status` accepts the returned `payment_id`
   (`PAY-...`) or the internal UUID. Status values are `pending`, `succeeded`,
   `failed`, `cancelled`, `expired` and `unknown`. `unknown` means the provider
   has not confirmed an outcome; check again rather than starting a duplicate
   payment.
4. Provider webhooks arrive at `POST /api/v1/payments/webhook`. In aggregator
   mode the raw body must carry a valid `x-payment-signature` HMAC SHA256
   signature using `PAYMENT_WEBHOOK_SECRET`. Events are deduplicated by
   `event_id`.

MTN numbers use the `078`/`079` prefixes and Airtel numbers use `072`/`073`.
Successful provider confirmation activates or extends the FindLove
subscription automatically and switches the profile to the purchased account
type. `GET /api/v1/findlove/subscription` returns the current subscription;
`PATCH /api/v1/findlove/account-type` switches between `private` and `public`
when no conflicting paid subscription is active.

Admins manage plans at `/api/v1/admin/installments` and inspect payments at
`GET /api/v1/admin/payments`. `PAYMENT_PROVIDER=fake` is for local development
only and is rejected in production. `PAYMENT_PROVIDER=aggregator` requires
`PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_API_KEY` and
`PAYMENT_WEBHOOK_SECRET`.

Errors share the `code`, `message` and `requestId` envelope; validation errors may also include `fields`, and throttling errors may include `retryAfterSeconds`. OTPs, access tokens, refresh tokens and device credentials shown as placeholders must be replaced with values from your running environment.
