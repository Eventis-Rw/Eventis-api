import { z } from "zod";

const overlaySchema = z.object({
  id: z.string().max(80),
  text: z.string().max(500),
  kind: z.enum(["text", "sticker"]),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  color: z.string().max(30),
  style: z.string().max(30),
  size: z.number().min(1).max(200),
});

export const createStatusSchema = z
  .object({
    event_id: z.string().uuid().optional(),
    media_url: z.string().url().optional(),
    media_type: z.enum(["image", "video", "text"]),
    caption: z.string().trim().max(1000).optional(),
    fit: z.enum(["cover", "contain"]).default("cover"),
    background: z.string().max(30).default("#101827"),
    overlays: z.array(overlaySchema).max(8).default([]),
  })
  .superRefine((value, context) => {
    if (value.media_type === "text" && !value.caption?.trim()) {
      context.addIssue({
        code: "custom",
        path: ["caption"],
        message: "Text statuses require a caption",
      });
    }
  });
