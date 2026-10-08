# Phone-first authentication (OTP + JWT)

ADR 0006. Module: `src/modules/identity/`.

## Flow (production SMS)

```
Client
  → POST /api/v1/auth/request-otp
  → Backend generates 6-digit OTP, stores HMAC hash only
  → Africa's Talking Production API
  → MTN Rwanda / Airtel Rwanda
  → Real phone receives SMS
  → POST /api/v1/auth/verify-otp  { phone, code, deviceId, deviceCredential? }
  → Backend verifies hash, creates/finds user, binds one device, issues JWT
```

## Environment

```bash
# Local / tests (no SMS leaves the machine)
SMS_PROVIDER=fake

# Real delivery to Rwanda mobiles (MTN 078/079, Airtel 072/073)
SMS_PROVIDER=africas_talking
AT_ENV=production
AT_USERNAME=<live-app-username>   # NOT "sandbox"
AT_API_KEY=<live-api-key>         # NEVER commit; rotate if exposed
AT_SENDER_ID=<optional-sender>    # registered shortcode / alphanumeric

JWT_ACCESS_SECRET=...             # min 32 chars — bun run scripts/generate-keys.ts
JWT_REFRESH_SECRET=...
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000
```

Sandbox (no real delivery): `AT_ENV=sandbox` and `AT_USERNAME=sandbox` with the
sandbox API key from the Africa's Talking dashboard.

## Migrate and run

```bash
docker compose -f docker/docker-compose.yml up -d
bunx --bun prisma migrate deploy
bun run dev
```

## Endpoints

| Method | Path                             | Auth   | Body                                                   |
| ------ | -------------------------------- | ------ | ------------------------------------------------------ |
| POST   | `/api/v1/auth/request-otp`       | —      | `{ "phone": "+2507…", "deviceId": "…" }`               |
| POST   | `/api/v1/auth/verify-otp`        | —      | `{ "phone", "code", "deviceId", "deviceCredential?" }` |
| POST   | `/api/v1/auth/refresh`           | —      | `{ "refreshToken" }`                                   |
| POST   | `/api/v1/auth/logout`            | Bearer | `{ "refreshToken" }`                                   |
| GET    | `/api/v1/auth/me`                | Bearer | —                                                      |
| POST   | `/api/v1/auth/signup`            | —      | `{ "phone", "username", "accountType?" }`; install ID attached automatically |
| POST   | `/api/v1/auth/signup/verify-otp` | —      | `{ "phone", "code" }`; same `X-Device-Id` header                 |
| POST   | `/api/v1/auth/login`             | —      | `{ "phone" }`; install ID and stored credential are headers |
| PATCH  | `/api/v1/users/me`               | Bearer | profile fields to update                               |

Signup accepts `username` and `phone` in the JSON body (`firstName` remains a
compatibility alias). The API stores this signup name in its current `firstName`
profile field. `accountType` is optional and defaults to `LOVE`. The app should
generate a random install ID once, persist it securely, and attach it as
`X-Device-Id` automatically on signup and OTP verification. Swagger UI does this
in the browser. This keeps the device ID out of the user-entered payload while
preserving rate limits and device binding.
Signup sends the OTP immediately and keeps the signup metadata with the hashed OTP
record until verification. The user, registered device, and refresh session are
then created in one database transaction.
`/auth/signup/send-otp` is an alias for the same signup request. The existing
`/auth/request-otp` route remains available for the phone-first OTP sign-in path.

Login does not disclose whether a phone exists or whether a device mismatched;
both return the same authentication error. Login's JSON body contains only the
phone. The client automatically sends its install ID as `X-Device-Id` and its
server-issued device credential as `X-Device-Credential`; native clients must
read these from persistent/secure storage. Swagger UI captures the credential
after signup OTP verification and supplies both headers automatically. Phone
alone never authenticates a user. Profile completion is optional and can happen
later through `PATCH /api/v1/users/me`.

### Example: log in on the registered device

In Swagger, submit only `{ "phone": "+250733958012" }` after completing OTP
verification in that browser tab. For a native client or cURL, send the same
headers from the install ID and credential saved during first verification:

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -H 'x-device-id: install-12345678' \
  -H "x-device-credential: $DEVICE_CREDENTIAL" \
  -d '{"phone":"+250733958012"}'
```

### Example: start signup

The `username` and `phone` appear in the signup body. Swagger UI adds its persisted
install ID automatically; native clients should attach their saved install ID in
the `X-Device-Id` header.

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -H 'x-device-id: install-12345678' \
  -d '{"phone":"+250733958012","username":"Aline"}'
```

`username` is currently stored in the API's `firstName` profile field. Signup
creates a `LOVE` account unless `accountType` is provided as `POSTER` or `LOVE`.

### Example: request OTP

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/request-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012","deviceId":"dev-install-00123456"}'
```

Response:

```json
{ "retryAfterSeconds": 60, "expiresAt": "2026-…" }
```

The OTP is **never** in the response. With `SMS_PROVIDER=fake`, check server
debug logs only for delivery confirmation (message body is not logged). In tests,
`FakeSmsProvider.lastOtpCode()` reads the in-memory sink.

### Example: verify OTP

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/verify-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012","code":"123456","deviceId":"dev-install-00123456"}'
```

First success returns `deviceCredential` **once** — store it securely (Keychain /
Keystore). Later verifies from the same install must send it. A different device
gets `FORBIDDEN` ("already registered on another device"); the first device is
never overwritten.

### Example: me

```bash
curl -sS http://localhost:3000/api/v1/auth/me \
  -H "authorization: Bearer $ACCESS_TOKEN"
```

## Security

| Control      | Behaviour                                                               |
| ------------ | ----------------------------------------------------------------------- |
| OTP storage  | HMAC-SHA256 only; raw OTP never in DB or API responses                  |
| OTP lifetime | 5 minutes; single use; max 5 attempts; 60s resend cooldown              |
| Device       | Server-issued `deviceCredential`; DB `@@unique(userId)`                 |
| Access JWT   | HS256, short TTL, payload = `sub` + `deviceId` only                     |
| Refresh      | Opaque token; hash stored; rotation + family revoke on reuse (ADR 0006) |
| Secrets      | `AT_API_KEY` / JWT secrets only in server env                           |

## Tests

```bash
bun test src                                    # unit (domain + token + env)
bun test test/integration/identity-auth.test.ts # needs Postgres migrated
```

## Smoke-test real SMS (production AT)

1. Put live credentials in `.env` (`SMS_PROVIDER=africas_talking`, `AT_ENV=production`).
2. Restart the API.
3. `POST /api/v1/auth/request-otp` with the target E.164 number.
4. Read the SMS on the handset; `POST /api/v1/auth/verify-otp` with the code.

Do not hard-code phone numbers or API keys in the repository.
