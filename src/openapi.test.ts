import { describe, expect, it } from "bun:test";

import { openApiDocument } from "./openapi.js";

type ResponseDescription = { description: string };
type Operation = {
  get?: {
    security?: unknown[];
    responses?: Record<string, ResponseDescription>;
  };
  post?: {
    security?: unknown[];
    requestBody?: { content?: Record<string, unknown> };
    responses?: Record<string, ResponseDescription>;
  };
  put?: {
    security?: unknown[];
    responses?: Record<string, ResponseDescription>;
  };
  patch?: {
    security?: unknown[];
    requestBody?: { content?: Record<string, unknown> };
    responses?: Record<string, ResponseDescription>;
  };
  delete?: {
    security?: unknown[];
    responses?: Record<string, ResponseDescription>;
  };
};
type Schema = {
  properties?: Record<
    string,
    { type?: string; format?: string; description?: string }
  >;
};
const paths = openApiDocument.paths as unknown as Record<
  string,
  Operation | undefined
>;

describe("openapi contract", () => {
  it("hides duplicate signup aliases from the public API docs", () => {
    expect(paths["/api/v1/auth/signup"]).toBeDefined();
    expect(paths["/api/v1/auth/signup/send-otp"]).toBeUndefined();
  });

  it("describes success and failure outcomes clearly for login and signup", () => {
    const loginResponses = paths["/api/v1/auth/login"]?.post?.responses;
    expect(loginResponses?.["201"]?.description).toContain("Authenticated");
    expect(loginResponses?.["401"]?.description).toContain(
      "Authentication failed",
    );

    const signupResponses = paths["/api/v1/auth/signup"]?.post?.responses;
    expect(signupResponses?.["201"]?.description).toContain("OTP sent");
    expect(signupResponses?.["409"]?.description).toContain("already");

    const signup = paths["/api/v1/auth/signup"]?.post;
    expect(signup?.security).toBeUndefined();
    expect(signup?.requestBody?.content?.["application/json"]).toEqual(
      expect.objectContaining({
        example: {
          phone: "+250788123456",
          username: "Aline",
          pin: "12345",
        },
      }),
    );
  });

  it("documents every event route with its authentication and response contract", () => {
    expect(paths["/api/v1/events"]?.get).toBeDefined();
    expect(paths["/api/v1/events"]?.post?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(paths["/api/v1/events/{id}"]?.get).toBeDefined();
    expect(paths["/api/v1/events/{id}"]?.put).toBeDefined();
    expect(paths["/api/v1/events/{id}"]?.patch).toBeDefined();
    expect(
      paths["/api/v1/events/{id}"]?.delete?.responses?.["204"],
    ).toBeDefined();
    expect(paths["/api/v1/events/{id}/share"]?.get).toBeDefined();
  });

  it("documents status viewer tracking for owners", () => {
    expect(paths["/api/v1/statuses/{id}/views"]?.get).toBeDefined();
    expect(paths["/api/v1/statuses/{id}/views"]?.get?.security).toEqual([
      { bearerAuth: [] },
    ]);
    expect(
      paths["/api/v1/statuses/{id}/views"]?.get?.responses?.["200"],
    ).toBeDefined();
    expect(paths["/api/v1/statuses/{id}/views"]?.post).toBeDefined();
    expect(paths["/api/v1/statuses/{id}/views"]?.post?.security).toEqual([
      { bearerAuth: [] },
    ]);
  });

  it("documents useful event failure codes and the field-error shape", () => {
    const createResponses = paths["/api/v1/events"]?.post?.responses;
    expect(createResponses?.["401"]?.description).toContain("token");
    expect(createResponses?.["403"]?.description).toContain("POSTER");
    expect(createResponses?.["422"]?.description).toContain("exact");
    expect(createResponses?.["500"]?.description).toContain("requestId");
    expect(createResponses?.["400"]).toBeUndefined();
    expect(
      openApiDocument.components.schemas.ApiError.properties.fields,
    ).toEqual(
      expect.objectContaining({
        additionalProperties: { type: "array", items: { type: "string" } },
      }),
    );
  });

  it("offers multipart image fields for profile photos and event covers", () => {
    const profileMultipart =
      paths["/api/v1/users/me"]?.patch?.requestBody?.content?.[
        "multipart/form-data"
      ];
    const createEventMultipart =
      paths["/api/v1/events"]?.post?.requestBody?.content?.[
        "multipart/form-data"
      ];
    const updateEventMultipart =
      paths["/api/v1/events/{id}"]?.patch?.requestBody?.content?.[
        "multipart/form-data"
      ];

    expect(profileMultipart).toEqual({
      schema: { $ref: "#/components/schemas/ProfileMultipartRequest" },
    });
    expect(
      Object.keys(paths["/api/v1/users/me"]?.patch?.requestBody?.content ?? {}),
    ).toEqual(["multipart/form-data"]);
    expect(
      Object.keys(paths["/api/v1/events"]?.post?.requestBody?.content ?? {}),
    ).toEqual(["multipart/form-data"]);
    expect(
      Object.keys(
        paths["/api/v1/events/{id}"]?.patch?.requestBody?.content ?? {},
      ),
    ).toEqual(["multipart/form-data"]);
    expect(createEventMultipart).toBeDefined();
    expect(updateEventMultipart).toBeDefined();

    const profileSchema = openApiDocument.components.schemas
      .ProfileMultipartRequest as Schema;
    const createEventSchema = openApiDocument.components.schemas
      .CreateEventMultipartRequest as Schema;
    const updateEventSchema = openApiDocument.components.schemas
      .UpdateEventMultipartRequest as Schema;
    expect(profileSchema.properties?.avatar_image).toEqual({
      type: "string",
      format: "binary",
      description: "JPEG, PNG or WebP image, maximum 5 MiB.",
    });
    expect(createEventSchema.properties?.cover_image).toEqual({
      type: "string",
      format: "binary",
      description: "JPEG, PNG or WebP image, maximum 5 MiB.",
    });
    expect(updateEventSchema.properties?.cover_image).toEqual({
      type: "string",
      format: "binary",
      description: "JPEG, PNG or WebP image, maximum 5 MiB.",
    });
  });

  it("documents every chat REST route with bearer authentication", () => {
    const routes: Array<[string, keyof Operation]> = [
      ["/api/v1/chat/contacts/sync", "post"],
      ["/api/v1/chat/conversations", "get"],
      ["/api/v1/chat/conversations", "post"],
      ["/api/v1/chat/conversations/{id}", "get"],
      ["/api/v1/chat/conversations/{id}/settings", "patch"],
      ["/api/v1/chat/conversations/{id}/messages", "get"],
      ["/api/v1/chat/conversations/{id}/messages", "post"],
      ["/api/v1/chat/conversations/{id}/messages/attachments", "post"],
      ["/api/v1/chat/messages/{id}", "patch"],
      ["/api/v1/chat/messages/{id}", "delete"],
      ["/api/v1/chat/conversations/{id}/read", "patch"],
      ["/api/v1/chat/conversations/{id}/receipts/delivered", "patch"],
      ["/api/v1/chat/attachments/{id}/content", "get"],
      ["/api/v1/chat/invitations", "get"],
      ["/api/v1/chat/invitations", "post"],
      ["/api/v1/chat/invitations/accept", "post"],
      ["/api/v1/chat/calls", "post"],
      ["/api/v1/chat/calls/{id}", "patch"],
      ["/api/v1/chat/calls/history", "get"],
    ];

    for (const [path, method] of routes) {
      const operation = paths[path]?.[method] as
        | { security?: unknown[]; responses?: Record<string, unknown> }
        | undefined;
      expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation?.security).toEqual([{ bearerAuth: [] }]);
      expect(operation?.responses?.["401"]).toBeDefined();
    }

    const schemas = openApiDocument.components.schemas as Record<
      string,
      unknown
    >;
    const chatAttachmentUpload = schemas.ChatAttachmentUpload as Schema;
    expect(chatAttachmentUpload.properties?.file).toEqual({
      type: "string",
      format: "binary",
      description: "One supported image, document or audio file, up to 15 MiB.",
    });
    const chatPublicProfile = schemas.ChatPublicProfile as Schema;
    expect(chatPublicProfile.properties?.phone).toBeUndefined();
  });
  it("documents FindLove installment and mobile money payment contracts", () => {
    expect(paths["/api/v1/installments"]?.get).toBeDefined();
    expect(paths["/api/v1/installments"]?.get?.security).toBeUndefined();
    expect(paths["/api/v1/findlove/account-types"]?.get?.security).toBeUndefined();
    expect(paths["/api/v1/payments/webhook"]?.post?.security).toBeUndefined();

    const authenticatedRoutes: Array<[string, keyof Operation]> = [
      ["/api/v1/payments", "post"],
      ["/api/v1/payments/{id}/status", "get"],
      ["/api/v1/admin/payments", "get"],
      ["/api/v1/admin/installments", "get"],
      ["/api/v1/admin/installments", "post"],
      ["/api/v1/admin/installments/{id}", "patch"],
      ["/api/v1/admin/installments/{id}/status", "patch"],
      ["/api/v1/findlove/subscription", "get"],
      ["/api/v1/findlove/account-type", "patch"],
    ];

    for (const [path, method] of authenticatedRoutes) {
      const operation = paths[path]?.[method] as
        | { security?: unknown[]; responses?: Record<string, unknown> }
        | undefined;
      expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation?.security).toEqual([{ bearerAuth: [] }]);
      expect(operation?.responses?.["401"]).toBeDefined();
    }

    const schemas = openApiDocument.components.schemas as Record<
      string,
      unknown
    >;
    const plan = schemas.InstallmentPlan as Schema;
    expect(plan.properties?.price_minor).toEqual(
      expect.objectContaining({ type: "string", pattern: "^\\d+$" }),
    );
    const payment = schemas.PaymentStatusResponse as Schema;
    expect(payment.properties?.payment_status?.type).toBe("string");
    expect(payment.properties?.amount_minor?.type).toBe("string");
  });

});
