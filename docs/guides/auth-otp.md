# Phone and PIN authentication

Signup verifies the phone number once with a six-digit OTP. After signup,
authentication uses the phone number and a five-digit PIN. The API does not
store device identities or device credentials.

## Endpoints

| Method | Path | Body |
| --- | --- | --- |
| POST | `/api/v1/auth/signup` | `{ "username", "phone", "pin", "accountType?" }` |
| POST | `/api/v1/auth/signup/verify-otp` | `{ "phone", "code" }` |
| POST | `/api/v1/auth/login` | `{ "phone", "pin" }` |
| POST | `/api/v1/auth/request-pin-reset` | `{ "phone" }` |
| POST | `/api/v1/auth/reset-pin` | `{ "phone", "code", "pin" }` |

`pin` must contain exactly five digits. The signup/reset OTP always contains
six digits and expires after five minutes.

## Signup

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/signup \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012","username":"Aline","pin":"12345"}'
```

Verify the received OTP:

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/signup/verify-otp \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012","code":"123456"}'
```

## Login

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012","pin":"12345"}'
```

## PIN reset

Request a reset OTP, then verify it with the replacement five-digit PIN:

```bash
curl -sS -X POST http://localhost:3000/api/v1/auth/request-pin-reset \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012"}'

curl -sS -X POST http://localhost:3000/api/v1/auth/reset-pin \
  -H 'content-type: application/json' \
  -d '{"phone":"+250733958012","code":"123456","pin":"54321"}'
```
