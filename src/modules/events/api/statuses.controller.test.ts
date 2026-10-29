import { describe, expect, it } from "bun:test";
import { createStatusSchema } from "./statuses.schema.js";

describe("createStatusSchema", () => {
  it("accepts captions and an empty overlays array", () => {
    const parsed = createStatusSchema.safeParse({
      media_type: "image",
      media_url: "https://cdn.example/story.jpg",
      caption: "Event starts soon ❤️",
      overlays: [],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.caption).toBe("Event starts soon ❤️");
      expect(parsed.data.overlays).toEqual([]);
    }
  });

  it("rejects captions over the declared maximum and empty text statuses", () => {
    expect(
      createStatusSchema.safeParse({
        media_type: "image",
        media_url: "https://cdn.example/story.jpg",
        caption: "x".repeat(1001),
      }).success,
    ).toBe(false);
    expect(
      createStatusSchema.safeParse({ media_type: "text", caption: " " })
        .success,
    ).toBe(false);
  });
});
