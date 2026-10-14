import { describe, expect, it } from "bun:test";

import { openApiDocument } from "./openapi.js";

type ResponseDescription = { description: string };
type Operation = {
  get?: { responses?: Record<string, ResponseDescription> };
  post?: { security?: unknown[]; requestBody?: { content?: Record<string, unknown> }; responses?: Record<string, ResponseDescription> };
  put?: { responses?: Record<string, ResponseDescription> };
  patch?: { requestBody?: { content?: Record<string, unknown> }; responses?: Record<string, ResponseDescription> };
  delete?: { responses?: Record<string, ResponseDescription> };
};
type Schema = {
  properties?: Record<string, { type?: string; format?: string; description?: string }>;
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
    expect(paths["/api/v1/events/{id}"]?.delete?.responses?.["204"]).toBeDefined();
    expect(paths["/api/v1/events/{id}/share"]?.get).toBeDefined();
  });

  it("documents useful event failure codes and the field-error shape", () => {
    const createResponses = paths["/api/v1/events"]?.post?.responses;
    expect(createResponses?.["401"]?.description).toContain("token");
    expect(createResponses?.["403"]?.description).toContain("POSTER");
    expect(createResponses?.["422"]?.description).toContain("exact");
    expect(createResponses?.["500"]?.description).toContain("requestId");
    expect(createResponses?.["400"]).toBeUndefined();
    expect(openApiDocument.components.schemas.ApiError.properties.fields).toEqual(
      expect.objectContaining({
        additionalProperties: { type: "array", items: { type: "string" } },
      }),
    );
  });

  it("offers multipart image fields for profile photos and event covers", () => {
    const profileMultipart = paths["/api/v1/users/me"]?.patch?.requestBody?.content?.["multipart/form-data"];
    const createEventMultipart = paths["/api/v1/events"]?.post?.requestBody?.content?.["multipart/form-data"];
    const updateEventMultipart = paths["/api/v1/events/{id}"]?.patch?.requestBody?.content?.["multipart/form-data"];

    expect(profileMultipart).toEqual({
      schema: { $ref: "#/components/schemas/ProfileMultipartRequest" },
    });
    expect(Object.keys(paths["/api/v1/users/me"]?.patch?.requestBody?.content ?? {}))
      .toEqual(["multipart/form-data"]);
    expect(Object.keys(paths["/api/v1/events"]?.post?.requestBody?.content ?? {}))
      .toEqual(["multipart/form-data"]);
    expect(Object.keys(paths["/api/v1/events/{id}"]?.patch?.requestBody?.content ?? {}))
      .toEqual(["multipart/form-data"]);
    expect(createEventMultipart).toBeDefined();
    expect(updateEventMultipart).toBeDefined();

    const profileSchema = openApiDocument.components.schemas.ProfileMultipartRequest as Schema;
    const createEventSchema = openApiDocument.components.schemas.CreateEventMultipartRequest as Schema;
    const updateEventSchema = openApiDocument.components.schemas.UpdateEventMultipartRequest as Schema;
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
});
