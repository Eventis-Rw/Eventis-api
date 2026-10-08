import { describe, expect, it } from "bun:test";

import { openApiDocument } from "./openapi.js";

const paths = openApiDocument.paths as Record<string, any>;

describe("openapi contract", () => {
  it("hides duplicate signup aliases from the public API docs", () => {
    expect(paths["/api/v1/auth/signup"]).toBeDefined();
    expect(paths["/api/v1/auth/signup/send-otp"]).toBeUndefined();
  });

  it("describes success and failure outcomes clearly for login and signup", () => {
    const loginResponses = paths["/api/v1/auth/login"].post.responses;
    expect(loginResponses["201"].description).toContain("Authenticated");
    expect(loginResponses["401"].description).toContain("Authentication failed");

    const signupResponses = paths["/api/v1/auth/signup"].post.responses;
    expect(signupResponses["201"].description).toContain("OTP sent");
    expect(signupResponses["409"].description).toContain("already");
  });
});
