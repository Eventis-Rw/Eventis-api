import { HttpException } from "@nestjs/common";
import { describe, expect, it } from "bun:test";

import { AllExceptionsFilter } from "./all-exceptions.filter.js";
describe("duplicate-email HTTP contract", () => {
  it("preserves the requested HTTP 409 error field and message", () => {
    let status = 0,
      body: unknown;
    const reply = {
      status: (value: number) => {
        status = value;
        return reply;
      },
      send: (value: unknown) => {
        body = value;
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => ({ id: "test" }),
      }),
    };
    new AllExceptionsFilter().catch(
      new HttpException({ error: "EMAIL_ALREADY_EXISTS" }, 409),
      host as never,
    );
    expect(status).toBe(409);
    expect(body).toMatchObject({
      error: "EMAIL_ALREADY_EXISTS",
      message:
        "An account with this email already exists. Please sign in instead.",
    });
  });
});
