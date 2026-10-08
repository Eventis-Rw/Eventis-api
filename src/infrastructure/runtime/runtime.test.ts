import { describe, expect, it } from "bun:test";

import { assertSupportedRuntime } from "./runtime.js";

describe("runtime guard", () => {
  it("accepts a supported Node release", () => {
    expect(() => assertSupportedRuntime("node", "20.20.2")).not.toThrow();
  });

  it("accepts a supported Bun release", () => {
    expect(() => assertSupportedRuntime("bun", "1.4.2")).not.toThrow();
  });

  it("rejects an unsupported Node release before the app boots", () => {
    expect(() => assertSupportedRuntime("node", "16.20.2")).toThrow(
      /Node\.js version 16\.20\.2|Node >= 18\.18\.0|Bun >= 1\.4\.0/,
    );
  });
});
