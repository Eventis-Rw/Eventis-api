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

  validateImage(
    file: { mimetype: string; data: Buffer; filename: string },
    fieldName = "cover_image",
  ): void {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype as (typeof ALLOWED_IMAGE_MIMES)[number])) {
      throw AppError.validation({
        [fieldName]: [
          `Invalid image type '${file.mimetype}'. Allowed types: ${ALLOWED_IMAGE_MIMES.join(", ")}`,
        ],
      });
    }

    if (file.data.length > MAX_IMAGE_SIZE) {
      throw AppError.validation({
        [fieldName]: [
          `Image size exceeds maximum limit of ${MAX_IMAGE_SIZE / (1024 * 1024)}MB`,
        ],
      });
    }

    const rawExt = extname(file.filename).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
    if (rawExt && !allowedExts.includes(rawExt)) {
      throw AppError.validation({
        [fieldName]: [`File extension '${rawExt}' is not allowed for images`],
      });
    }

    const expectedExt = {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
    }[file.mimetype];
    if (rawExt && expectedExt && !expectedExt.includes(rawExt)) {
      throw AppError.validation({
        [fieldName]: ["File extension does not match the declared image type"],
      });
    }

    const signatureMatches =
      (file.mimetype === "image/jpeg" && file.data.length >= 3 && file.data[0] === 0xff && file.data[1] === 0xd8 && file.data[2] === 0xff) ||
      (file.mimetype === "image/png" && file.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (file.mimetype === "image/webp" && file.data.length >= 12 && file.data.toString("ascii", 0, 4) === "RIFF" && file.data.toString("ascii", 8, 12) === "WEBP");
    if (!signatureMatches) {
      throw AppError.validation({
        [fieldName]: ["File content does not match the declared image type"],
      });
    }
  }


  async uploadCoverImage(
    eventId: string,
    file: { mimetype: string; data: Buffer; filename: string },
  ): Promise<string> {
    this.validateImage(file);

    let ext = extname(file.filename).toLowerCase();
    if (!ext || ext === "") {
      ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
    }

    const sanitizedKey = `events/${eventId}/cover-${randomUUID()}${ext}`;

    return this.uploadImage(
      sanitizedKey,
      file.data,
      file.mimetype,
    );
  }

  async uploadAvatarImage(
    userId: string,
    file: { mimetype: string; data: Buffer; filename: string },
  ): Promise<string> {
    this.validateImage(file, "avatar_image");

    let ext = extname(file.filename).toLowerCase();
    if (!ext) {
      ext = file.mimetype === "image/png" ? ".png" : file.mimetype === "image/webp" ? ".webp" : ".jpg";
    }

    const key = `users/${userId}/avatar-${randomUUID()}${ext}`;
    return this.uploadImage(key, file.data, file.mimetype);
  }


  getPublicUrl(key: string | null): string | null {
    if (!key) return null;
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }
    const cleanKey = key.replace(/^\/+/, "");
    return `${this.env.STORAGE_ENDPOINT.replace(/\/$/, "")}/${this.env.STORAGE_BUCKET}/${cleanKey}`;
  }

  getStorageKeyFromPublicUrl(value: string | null): string | null {
    if (!value) return null;

    try {
      const endpoint = new URL(this.env.STORAGE_ENDPOINT);
      const url = new URL(value);
      const bucketPrefix = `${endpoint.pathname.replace(/\/$/, "")}/${this.env.STORAGE_BUCKET}/`;
      if (url.origin !== endpoint.origin || !url.pathname.startsWith(bucketPrefix)) {
        return null;
      }
      return decodeURIComponent(url.pathname.slice(bucketPrefix.length)) || null;
    } catch {
      return null;
    }
  }


  async deleteFile(key: string | null): Promise<void> {
    if (!key) return;

    if (this.isCloudinaryUrl(key)) {
      await this.deleteCloudinaryFile(key);
      return;
    }

    const storageKey = key.startsWith("http://") || key.startsWith("https://")
      ? this.getStorageKeyFromPublicUrl(key)
      : key;
    if (!storageKey) return;

    const response = await this.request("DELETE", storageKey.replace(/^\/+/, ""));
    if (!response.ok && response.status !== 404) {
      throw new Error(`Object storage delete failed with status ${response.status}`);
    }
  }

  private async uploadImage(
      key: string,
      data: Buffer,
      contentType: string,
    ): Promise<string> {
      if (this.isCloudinaryConfigured()) {
        return this.uploadToCloudinary(key, data, contentType);
      }

      const response = await this.request("PUT", key, data, contentType);
      if (!response.ok) {
        throw new Error(`Object storage upload failed with status ${response.status}`);
      }
      return key;
    }

  private isCloudinaryConfigured(): boolean {
      return Boolean(
        this.env.CLOUDINARY_CLOUD_NAME &&
        this.env.CLOUDINARY_API_KEY &&
        this.env.CLOUDINARY_API_SECRET,
      );
    }

  private isCloudinaryUrl(value: string): boolean {
      return value.includes("res.cloudinary.com/");
    }

  private async uploadToCloudinary(
      key: string,
      data: Buffer,
      contentType: string,
    ): Promise<string> {
      const cloudName = this.env.CLOUDINARY_CLOUD_NAME!;
      const apiKey = this.env.CLOUDINARY_API_KEY!;
      const apiSecret = this.env.CLOUDINARY_API_SECRET!;
      const timestamp = Math.floor(this.clock.now().getTime() / 1000).toString();
      const folder = key.slice(0, key.lastIndexOf("/"));
      const publicId = key.slice(key.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "");
      const signature = createHash("sha1")
        .update(`folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
        .digest("hex");
      const form = new FormData();
      form.append("file", new Blob([data], { type: contentType }), publicId);
      form.append("api_key", apiKey);
      form.append("timestamp", timestamp);
      form.append("folder", folder);
      form.append("public_id", publicId);
      form.append("signature", signature);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`,
        { method: "POST", body: form, signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) {
        throw new Error(`Cloudinary image upload failed with status ${response.status}`);
      }
      const payload = (await response.json()) as { secure_url?: unknown };
      if (typeof payload.secure_url !== "string" || !payload.secure_url) {
        throw new Error("Cloudinary image upload returned no secure URL");
      }
      return payload.secure_url;
    }

  private async deleteCloudinaryFile(url: string): Promise<void> {
      const match = url.match(/\/image\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
      if (!match?.[1]) return;

      const cloudName = this.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = this.env.CLOUDINARY_API_KEY;
      const apiSecret = this.env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return;

      const publicId = match[1].replace(/\.[^.]+$/, "");
      const timestamp = Math.floor(this.clock.now().getTime() / 1000).toString();
      const signature = createHash("sha1")
        .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
        .digest("hex");
      const form = new URLSearchParams({
        public_id: publicId,
        api_key: apiKey,
        timestamp,
        signature,
      });
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: form,
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) {
        throw new Error(`Cloudinary image deletion failed with status ${response.status}`);
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
