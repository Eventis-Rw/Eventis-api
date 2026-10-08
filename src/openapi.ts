/**
 * Generates the API's OpenAPI document. Keep paths in sync with the controllers;
 * request schemas below mirror their Zod validation rules.
 *
 *   bun run openapi
 */
import { category, eventDetail, eventSummary, order, orderPaymentState, remoteConfig, ticket } from "@eventis/contracts";
import { z } from "zod";

const schemas = {
  Category: category,
  EventSummary: eventSummary,
  EventDetail: eventDetail,
  Order: order,
  OrderPaymentState: orderPaymentState,
  Ticket: ticket,
  RemoteConfig: remoteConfig,
};
const contractSchemas = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, z.toJSONSchema(schema, { target: "openapi-3.0", io: "output" })]));

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const deviceIdHeader = { name: "X-Device-Id", in: "header", required: true, description: "Stable install ID generated and persisted automatically by the Swagger page and by the mobile app.", schema: { type: "string", minLength: 8, maxLength: 128 }, example: "install-12345678" };
const deviceCredentialHeader = { name: "X-Device-Credential", in: "header", required: true, description: "Secret returned once in the signup/verify-otp response as deviceCredential — not the same as X-Device-Id. The mobile app stores it in secure storage; Swagger saves it after a successful signup OTP verification and reuses it on login.", schema: { type: "string", minLength: 32, maxLength: 256 }, example: "<paste-deviceCredential-from-signup-response>" };
const json = (schema: unknown, example?: unknown) => ({ "application/json": { schema, ...(example === undefined ? {} : { example }) } });
const body = (schema: unknown, example: unknown) => ({ required: true, content: json(schema, example) });
const response = (description: string, schema?: unknown, example?: unknown) => ({ description, ...(schema === undefined ? {} : { content: json(schema, example) }) });
const validationError = response("Validation failed: invalid phone, body, or required fields", ref("ApiError"), { code: "VALIDATION_FAILED", message: "Some fields need attention", requestId: "req_01J9EXAMPLE", fields: { phone: ["Enter a valid Rwanda phone number"] } });
const authError = response("Authentication failed: OTP, device, or credential did not match", ref("ApiError"), { code: "OTP_INVALID", message: "Invalid verification code", requestId: "req_01J9EXAMPLE" });
const conflictError = response("Signup is already in progress or the account already exists", ref("ApiError"), { code: "FORBIDDEN", message: "Phone number is already registered", requestId: "req_01J9EXAMPLE" });
const rateLimitError = response("Too many OTP attempts or sends for this phone/device", ref("ApiError"), { code: "RATE_LIMITED", message: "Too many attempts. Try again shortly.", requestId: "req_01J9EXAMPLE", retryAfterSeconds: 60 });
const sessionExample = {
  user: { id: "550e8400-e29b-41d4-a716-446655440000", phone: "+250788123456", displayName: "Aline Uwase", avatarUrl: null, roles: ["customer"], createdAt: "2026-10-06T10:00:00.000Z" },
  tokens: { accessToken: "<access-token>", accessTokenExpiresAt: "2026-10-06T10:15:00.000Z", refreshToken: "<refresh-token>", refreshTokenExpiresAt: "2026-11-05T10:00:00.000Z" },
  deviceCredential: "<returned-on-first-device-registration-only>",
};

const paths = {
  "/healthz": { get: { tags: ["Health"], summary: "Liveness probe", description: "Confirms the API process is running; does not check dependencies.", responses: { "200": response("Process is alive", { type: "object", properties: { status: { const: "ok" } } }, { status: "ok" }) } } },
  "/readyz": { get: { tags: ["Health"], summary: "Readiness probe", description: "Checks whether the API can serve traffic by querying the database.", responses: { "200": response("Readiness report", ref("ReadinessReport"), { status: "ok", checks: { database: { ok: true, latencyMs: 3 } }, checkedAt: "2026-10-06T10:00:00.000Z" }) } } },
  "/api/v1/auth/request-otp": { post: { tags: ["Authentication"], summary: "Request a sign-in OTP", description: "Sends a one-time code to an existing account's phone.", requestBody: body(ref("OtpRequest"), { phone: "+250788123456", deviceId: "install-12345678" }), responses: { "201": response("OTP sent to the phone", ref("OtpRequestResponse"), { retryAfterSeconds: 60, expiresAt: "2026-10-06T10:05:00.000Z" }), "400": validationError, "429": rateLimitError } } },
  "/api/v1/auth/login": { post: { tags: ["Authentication"], summary: "Log in with a registered device", description: "The JSON body contains the phone. Headers must include the install ID (X-Device-Id) and the device secret (X-Device-Credential) from signup — these are different values. Reusing the install ID as the credential always fails.", parameters: [deviceIdHeader, deviceCredentialHeader], requestBody: body(ref("LoginRequest"), { phone: "+250788123456" }), responses: { "201": response("Authenticated: session created", ref("AuthSession"), sessionExample), "400": validationError, "401": authError } } },
  "/api/v1/auth/signup": { post: { tags: ["Authentication"], summary: "Start account signup", description: "The API sends a six-digit OTP to the supplied phone. The same install ID must be reused later during verification. Signup is tied to the phone, requested display name, and device identity.", parameters: [deviceIdHeader], requestBody: body(ref("SignupRequest"), { phone: "+250788123456", username: "Aline" }), responses: { "201": response("OTP sent to the new account", ref("OtpRequestResponse"), { retryAfterSeconds: 60, expiresAt: "2026-10-06T10:05:00.000Z" }), "400": validationError, "409": conflictError, "429": rateLimitError } } },
  "/api/v1/auth/signup/verify-otp": { post: { tags: ["Authentication"], summary: "Verify signup OTP", description: "The same install ID and the exact signup identity are required. If a different username or account type is supplied for the same phone/device pair, the request is rejected.", parameters: [deviceIdHeader], requestBody: body(ref("SignupOtpVerifyRequest"), { phone: "+250788123456", code: "123456", displayName: "Aline Uwase" }), responses: { "201": response("Account created and authenticated", ref("AuthSession"), sessionExample), "400": validationError, "401": authError, "403": response("Device mismatch or duplicate registration", ref("ApiError"), { code: "FORBIDDEN", message: "This account is already registered on another device", requestId: "req_01J9EXAMPLE" }) } } },
  "/api/v1/auth/verify-otp": { post: { tags: ["Authentication"], summary: "Verify sign-in OTP", requestBody: body(ref("OtpVerifyRequest"), { phone: "+250788123456", code: "123456", deviceId: "install-12345678" }), responses: { "201": response("Authenticated session", ref("AuthSession"), sessionExample), "400": validationError, "401": authError, "403": response("Device mismatch", ref("ApiError"), { code: "FORBIDDEN", message: "This account is already registered on another device", requestId: "req_01J9EXAMPLE" }) } } },
  "/api/v1/auth/refresh": { post: { tags: ["Authentication"], summary: "Refresh session tokens", requestBody: body(ref("RefreshRequest"), { refreshToken: "<refresh-token>" }), responses: { "201": response("New token pair", ref("AuthTokens"), sessionExample.tokens), "401": authError } } },
  "/api/v1/auth/logout": { post: { tags: ["Authentication"], summary: "Revoke refresh token", security: [{ bearerAuth: [] }], requestBody: body(ref("RefreshRequest"), { refreshToken: "<refresh-token>" }), responses: { "204": response("Logged out"), "401": authError } } },
  "/api/v1/auth/me": { get: { tags: ["Authentication"], summary: "Get current session user", security: [{ bearerAuth: [] }], responses: { "200": response("Current user", ref("SessionUser"), sessionExample.user), "401": authError } } },
  "/api/v1/users/me": { patch: { tags: ["Users"], summary: "Update current user profile", security: [{ bearerAuth: [] }], requestBody: body(ref("UpdateProfileRequest"), { firstName: "Aline", lastName: "Uwase", displayName: "irakoze", email: null, accountType: "LOVE", avatarUrl: null, organizationName: null, organizationDescription: null, dateOfBirth: null, gender: null, bio: null, location: "Kigali", interestedIn: null }), responses: { "200": response("Updated profile", ref("ProfileResponse"), { ...sessionExample.user, firstName: "Aline", lastName: "Uwase", displayName: "irakoze", email: null, accountType: "LOVE", avatarUrl: null, organizationName: null, organizationDescription: null, dateOfBirth: null, gender: null, bio: null, location: "Kigali", interestedIn: null, updatedAt: "2026-10-06T10:05:00.000Z" }), "400": validationError, "401": authError, "409": conflictError } } },
  "/api/v1/users/me/devices": { get: { tags: ["Users"], summary: "List trusted devices", security: [{ bearerAuth: [] }], responses: { "200": response("Trusted devices", { type: "array", items: ref("UserDeviceRecord") }, [{ id: "dvc_123", userId: "550e8400-e29b-41d4-a716-446655440000", deviceId: "install-12345678", deviceName: "Aline's iPhone", platform: "ios", osVersion: "18.0", appVersion: "2.1.0", lastSeenAt: "2026-10-06T10:05:00.000Z", revokedAt: null, metadata: { "app-build": "2026.10.06" }, createdAt: "2026-10-06T10:00:00.000Z", updatedAt: "2026-10-06T10:05:00.000Z" }]), "401": authError } } },
  "/api/v1/users/me/devices/{deviceId}": {
    patch: { tags: ["Users"], summary: "Update a trusted device", security: [{ bearerAuth: [] }], parameters: [{ name: "deviceId", in: "path", required: true, schema: { type: "string", format: "uuid" }, example: "dvc_123" }], requestBody: body(ref("UpdateUserDeviceRequest"), { deviceName: "Aline's iPhone" }), responses: { "200": response("Updated device", ref("UserDeviceRecord"), { id: "dvc_123", userId: "550e8400-e29b-41d4-a716-446655440000", deviceId: "install-12345678", deviceName: "Aline's iPhone", platform: "ios", osVersion: "18.0", appVersion: "2.1.0", lastSeenAt: "2026-10-06T10:05:00.000Z", revokedAt: null, metadata: { "app-build": "2026.10.06" }, createdAt: "2026-10-06T10:00:00.000Z", updatedAt: "2026-10-06T10:05:00.000Z" }), "401": authError, "404": response("Device not found", ref("ApiError"), { code: "NOT_FOUND", message: "User device was not found", requestId: "req_01J9EXAMPLE" }) } },
    delete: { tags: ["Users"], summary: "Revoke a trusted device", security: [{ bearerAuth: [] }], parameters: [{ name: "deviceId", in: "path", required: true, schema: { type: "string", format: "uuid" }, example: "dvc_123" }], responses: { "200": response("Device revoked", { type: "object", properties: { revoked: { type: "boolean" }, deviceId: { type: "string" } } }, { revoked: true, deviceId: "install-12345678" }), "401": authError, "404": response("Device not found", ref("ApiError"), { code: "NOT_FOUND", message: "User device was not found", requestId: "req_01J9EXAMPLE" }) } },
  },

};

const localSchemas = {
  ApiError: { type: "object", required: ["code", "message", "requestId"], properties: { code: { type: "string", example: "VALIDATION_FAILED" }, message: { type: "string", example: "Request validation failed" }, requestId: { type: "string", example: "req_01J9EXAMPLE" }, fields: { type: "object", additionalProperties: { type: "string" } }, retryAfterSeconds: { type: "integer" } } },
  OtpRequest: { type: "object", required: ["phone", "deviceId"], properties: { phone: { type: "string", pattern: "^\\+[1-9]\\d{7,14}$", example: "+250788123456" }, deviceId: { type: "string", minLength: 8, maxLength: 128, example: "install-12345678" } } },
  OtpRequestResponse: { type: "object", properties: { retryAfterSeconds: { type: "integer" }, expiresAt: { type: "string", format: "date-time" } } },
  SignupRequest: { type: "object", required: ["phone"], anyOf: [{ required: ["username"] }, { required: ["firstName"] }], properties: { phone: { type: "string", pattern: "^\\+[1-9]\\d{7,14}$", example: "+250788123456" }, username: { type: "string", minLength: 2, maxLength: 100, example: "Aline", description: "Signup name. Stored in the current firstName profile field." }, firstName: { type: "string", minLength: 2, maxLength: 100, description: "Compatibility alias for username." }, accountType: { type: "string", enum: ["POSTER", "LOVE"], default: "LOVE" } } },
  SignupOtpVerifyRequest: { type: "object", required: ["phone", "code"], properties: { phone: { type: "string", example: "+250788123456" }, code: { type: "string", pattern: "^\\d{6}$", example: "123456" }, deviceCredential: { type: "string", minLength: 32, maxLength: 256 }, displayName: { type: "string", minLength: 2, maxLength: 60 } } },
  OtpVerifyRequest: { type: "object", required: ["phone", "code", "deviceId"], properties: { phone: { type: "string", example: "+250788123456" }, code: { type: "string", pattern: "^\\d{6}$", example: "123456" }, deviceId: { type: "string", minLength: 8, maxLength: 128 }, deviceCredential: { type: "string", minLength: 32, maxLength: 256 }, displayName: { type: "string", minLength: 2, maxLength: 60 } } },
  LoginRequest: { type: "object", required: ["phone"], properties: { phone: { type: "string", pattern: "^\\+[1-9]\\d{7,14}$", example: "+250788123456" } } },
  RefreshRequest: { type: "object", required: ["refreshToken"], properties: { refreshToken: { type: "string" } } },
  SessionUser: { type: "object", properties: { id: { type: "string", format: "uuid" }, phone: { type: "string" }, displayName: { type: ["string", "null"] }, avatarUrl: { type: ["string", "null"], format: "uri" }, roles: { type: "array", items: { type: "string" } }, createdAt: { type: "string", format: "date-time" } } },
  AuthTokens: { type: "object", properties: { accessToken: { type: "string" }, accessTokenExpiresAt: { type: "string", format: "date-time" }, refreshToken: { type: "string" }, refreshTokenExpiresAt: { type: "string", format: "date-time" } } },
  AuthSession: { type: "object", properties: { user: ref("SessionUser"), tokens: ref("AuthTokens"), deviceCredential: { type: "string", description: "Returned only when this device is registered for the first time." } } },
  UpdateProfileRequest: { type: "object", minProperties: 1, properties: { firstName: { type: "string", minLength: 2, maxLength: 100 }, lastName: { type: ["string", "null"], minLength: 2, maxLength: 100 }, displayName: { type: ["string", "null"], minLength: 2, maxLength: 60 }, email: { type: ["string", "null"], format: "email" }, accountType: { type: "string", enum: ["POSTER", "LOVE"] }, avatarUrl: { type: ["string", "null"], format: "uri", maxLength: 500 }, organizationName: { type: ["string", "null"], maxLength: 160 }, organizationDescription: { type: ["string", "null"], maxLength: 10000 }, dateOfBirth: { type: ["string", "null"], format: "date" }, gender: { type: ["string", "null"], maxLength: 30 }, bio: { type: ["string", "null"], maxLength: 10000 }, location: { type: ["string", "null"], maxLength: 160 }, interestedIn: { type: ["string", "null"], maxLength: 30 } } },
  UpdateUserDeviceRequest: { type: "object", properties: { deviceName: { type: "string", minLength: 1, maxLength: 255 }, platform: { type: "string", minLength: 1, maxLength: 50 }, osVersion: { type: "string", minLength: 1, maxLength: 80 }, appVersion: { type: "string", minLength: 1, maxLength: 80 } } },
  UserDeviceRecord: { type: "object", properties: { id: { type: "string", format: "uuid" }, userId: { type: "string", format: "uuid" }, deviceId: { type: "string" }, deviceName: { type: ["string", "null"] }, platform: { type: ["string", "null"] }, osVersion: { type: ["string", "null"] }, appVersion: { type: ["string", "null"] }, lastSeenAt: { type: ["string", "null"], format: "date-time" }, revokedAt: { type: ["string", "null"], format: "date-time" }, metadata: { type: ["object", "null"], additionalProperties: true }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  ProfileResponse: { type: "object", properties: { id: { type: "string", format: "uuid" }, phone: { type: "string" }, firstName: { type: ["string", "null"] }, lastName: { type: ["string", "null"] }, email: { type: ["string", "null"], format: "email" }, accountType: { type: ["string", "null"], enum: ["POSTER", "LOVE", null] }, displayName: { type: ["string", "null"] }, avatarUrl: { type: ["string", "null"], format: "uri" }, organizationName: { type: ["string", "null"] }, organizationDescription: { type: ["string", "null"] }, dateOfBirth: { type: ["string", "null"], format: "date" }, gender: { type: ["string", "null"] }, bio: { type: ["string", "null"] }, location: { type: ["string", "null"] }, interestedIn: { type: ["string", "null"] }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } },
  ReadinessReport: { type: "object", properties: { status: { type: "string", enum: ["ok", "degraded"] }, checks: { type: "object", additionalProperties: { type: "object", properties: { ok: { type: "boolean" }, latencyMs: { type: "number" }, error: { type: "string" } } } }, checkedAt: { type: "string", format: "date-time" } } },
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Eventis API",
    version: "1.0.0",
    description: "Event discovery and account API. All timestamps are ISO 8601 UTC. Errors use a consistent ApiError envelope. Phone values use E.164 format. OTPs and device credentials in examples are placeholders; use the code delivered by your configured SMS provider.",
    contact: { name: "Eventis API support" },
  },
  servers: [
    { url: "http://localhost:3000", description: "Local development" },
    { url: "https://api.eventis.rw", description: "Production" },
  ],
  tags: [
    { name: "Health", description: "Process and dependency probes (unversioned)" },
    { name: "Authentication", description: "Phone OTP, sessions and token management" },
    { name: "Users", description: "Authenticated profile management" },
  ],
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT", description: "Paste the accessToken returned by OTP verification or login." } },
    schemas: { ...contractSchemas, ...localSchemas },
  },
};
