import { createHash, createHmac, randomUUID } from "node:crypto";
import { extname } from "node:path";

import { Inject, Injectable } from "@nestjs/common";

import { Clock } from "../../common/clock.js";
import { AppError } from "../../common/errors/app-error.js";
import { ENV, type Env } from "../../config/env.js";

export interface UploadedFile {
  fieldname: string;
  filename: string;
  encoding: string;
  mimetype: string;
  data: Buffer;
}

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

@Injectable()
export class StorageService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  /**
   * Validate image MIME, extension and file size.
   */
  validateImage(file: { mimetype: string; data: Buffer; filename: string }): void {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype as (typeof ALLOWED_IMAGE_MIMES)[number])) {
      throw AppError.validation({
        cover_image: [
          `Invalid image type '${file.mimetype}'. Allowed types: ${ALLOWED_IMAGE_MIMES.join(", ")}`,
        ],
      });
    }

    if (file.data.length > MAX_IMAGE_SIZE) {
      throw AppError.validation({
        cover_image: [
          `Image size exceeds maximum limit of ${MAX_IMAGE_SIZE / (1024 * 1024)}MB`,
        ],
      });
    }

    const rawExt = extname(file.filename).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
    if (rawExt && !allowedExts.includes(rawExt)) {
      throw AppError.validation({
        cover_image: [`File extension '${rawExt}' is not allowed for images`],
      });
    }

    const expectedExt = {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    }[file.mimetype];
    if (rawExt && expectedExt && !expectedExt.includes(rawExt)) {
      throw AppError.validation({
        cover_image: ["File extension does not match the declared image type"],
      });
    }

    const signatureMatches =
      (file.mimetype === "image/jpeg" && file.data.length >= 3 && file.data[0] === 0xff && file.data[1] === 0xd8 && file.data[2] === 0xff) ||
      (file.mimetype === "image/png" && file.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (file.mimetype === "image/webp" && file.data.length >= 12 && file.data.toString("ascii", 0, 4) === "RIFF" && file.data.toString("ascii", 8, 12) === "WEBP");
    if (!signatureMatches) {
      throw AppError.validation({
        cover_image: ["File content does not match the declared image type"],
      });
    }
  }

  /**
   * Store image file safely and return the persistent storage key.
   */
  async uploadCoverImage(
    eventId: string,
    file: { mimetype: string; data: Buffer; filename: string },
  ): Promise<string> {
    this.validateImage(file);

    let ext = extname(file.filename).toLowerCase();
    if (!ext || ext === "") {
      ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
    }

    // Sanitize and generate safe key
    const sanitizedKey = `events/${eventId}/cover-${randomUUID()}${ext}`;

    const response = await this.request("PUT", sanitizedKey, file.data, file.mimetype);
    if (!response.ok) {
      throw new Error(`Object storage upload failed with status ${response.status}`);
    }

    return sanitizedKey;
  }

  /**
   * Format the public URL from the stored key.
   */
  getPublicUrl(key: string | null): string | null {
    if (!key) return null;
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }
    const cleanKey = key.replace(/^\/+/, "");
    return `${this.env.STORAGE_ENDPOINT.replace(/\/$/, "")}/${this.env.STORAGE_BUCKET}/${cleanKey}`;
  }

  /**
   * Delete image file from storage if present.
   */
  async deleteFile(key: string | null): Promise<void> {
    if (!key) return;

    const response = await this.request("DELETE", key.replace(/^\/+/, ""));
    if (!response.ok && response.status !== 404) {
      throw new Error(`Object storage delete failed with status ${response.status}`);
    }
  }

  private async request(
    method: "PUT" | "DELETE",
    key: string,
    body?: Buffer,
    contentType = "application/octet-stream",
  ): Promise<Response> {
    const endpoint = new URL(this.env.STORAGE_ENDPOINT);
    const path = `/${this.env.STORAGE_BUCKET}/${key}`;
    const canonicalUri = path.split("/").map((part) => encodeURIComponent(decodeURIComponent(part))).join("/");
    const url = new URL(canonicalUri, endpoint);
    const now = this.clock.now();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const date = amzDate.slice(0, 8);
    const payloadHash = createHash("sha256").update(body ?? Buffer.alloc(0)).digest("hex");
    const headers = {
      "content-type": contentType,
      host: url.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
    const canonicalHeaders = Object.entries(headers).map(([name, value]) => `${name}:${value.trim()}\n`).join("");
    const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const region = endpoint.hostname.endsWith("r2.cloudflarestorage.com")
      ? "auto"
      : "us-east-1";
    const scope = `${date}/${region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
    const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.env.STORAGE_SECRET_ACCESS_KEY}`, date), region), "s3"), "aws4_request");
    const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authorization = `AWS4-HMAC-SHA256 Credential=${this.env.STORAGE_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return fetch(url, {
      method,
      headers: { ...headers, authorization },
      ...(body ? { body } : {}),
      signal: AbortSignal.timeout(5000),
    });
  }
}
