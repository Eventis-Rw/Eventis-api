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

| Method | URL | Authentication |
| --- | --- | --- |
| GET | `/healthz` | No |
| GET | `/readyz` | No |
| POST | `/api/v1/auth/request-otp` | No |
| POST | `/api/v1/auth/login` | No |
| POST | `/api/v1/auth/signup` | No |
| POST | `/api/v1/auth/signup/send-otp` | No |
| POST | `/api/v1/auth/signup/verify-otp` | No |
| POST | `/api/v1/auth/verify-otp` | No |
| POST | `/api/v1/auth/refresh` | No |
| POST | `/api/v1/auth/logout` | Bearer access token |
| GET | `/api/v1/auth/me` | Bearer access token |
| PATCH | `/api/v1/users/me` | Bearer access token |


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

Errors share the `code`, `message` and `requestId` envelope; validation errors may also include `fields`, and throttling errors may include `retryAfterSeconds`. OTPs, access tokens, refresh tokens and device credentials shown as placeholders must be replaced with values from your running environment.
