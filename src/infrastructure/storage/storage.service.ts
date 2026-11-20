import { createHash, createHmac, randomUUID } from "node:crypto";
import { extname } from "node:path";

import { ERROR_CODES } from "@eventis/contracts";
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
  "image/gif",
  "image/avif",
  "image/heic",
  "image/heif",
  "image/bmp",
  "image/x-ms-bmp",
  "image/tiff",
  "image/x-tiff",
] as const;

export const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_EVENT_COVER_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_CHAT_FILE_SIZE = 15 * 1024 * 1024;
export const MAX_STATUS_VIDEO_SIZE = 15 * 1024 * 1024;
export const ALLOWED_STATUS_VIDEO_MIMES = ["video/mp4", "video/webm", "video/quicktime"] as const;

export const ALLOWED_CHAT_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/m4a",
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

@Injectable()
export class StorageService {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly clock: Clock,
  ) {}

  validateImage(
    file: { mimetype: string; data: Buffer; filename: string },
    fieldName = "cover_image",
    maxSize = MAX_IMAGE_SIZE,
  ): void {
    if (!ALLOWED_IMAGE_MIMES.includes(file.mimetype as (typeof ALLOWED_IMAGE_MIMES)[number])) {
      throw AppError.validation({
        [fieldName]: [
          `Invalid image type '${file.mimetype}'. Allowed types: ${ALLOWED_IMAGE_MIMES.join(", ")}`,
        ],
      });
    }

    if (file.data.length > maxSize) {
      throw AppError.validation({
        [fieldName]: [
          `Image size exceeds maximum limit of ${maxSize / (1024 * 1024)}MB`,
        ],
      });
    }

    const rawExt = extname(file.filename).toLowerCase();
    const allowedExts = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".heic", ".heif", ".bmp", ".tif", ".tiff"];
    if (rawExt && !allowedExts.includes(rawExt)) {
      throw AppError.validation({
        [fieldName]: [`File extension '${rawExt}' is not allowed for images`],
      });
    }

    const expectedExt = {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "image/webp": [".webp"],
      "image/gif": [".gif"],
      "image/avif": [".avif"],
      "image/heic": [".heic"],
      "image/heif": [".heif"],
      "image/bmp": [".bmp"],
      "image/x-ms-bmp": [".bmp"],
      "image/tiff": [".tif", ".tiff"],
      "image/x-tiff": [".tif", ".tiff"],
    }[file.mimetype];
    if (rawExt && expectedExt && !expectedExt.includes(rawExt)) {
      throw AppError.validation({
        [fieldName]: ["File extension does not match the declared image type"],
      });
    }

    const signatureMatches =
      (file.mimetype === "image/jpeg" && file.data.length >= 3 && file.data[0] === 0xff && file.data[1] === 0xd8 && file.data[2] === 0xff) ||
      (file.mimetype === "image/png" && file.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) ||
      (file.mimetype === "image/webp" && file.data.length >= 12 && file.data.toString("ascii", 0, 4) === "RIFF" && file.data.toString("ascii", 8, 12) === "WEBP") ||
      (file.mimetype === "image/gif" && ["GIF87a", "GIF89a"].includes(file.data.toString("ascii", 0, 6))) ||
      ((file.mimetype === "image/bmp" || file.mimetype === "image/x-ms-bmp") && file.data.length >= 2 && file.data.toString("ascii", 0, 2) === "BM") ||
      ((file.mimetype === "image/tiff" || file.mimetype === "image/x-tiff") && file.data.length >= 4 && ["49492a00", "4d4d002a", "49492b00", "4d4d002b"].includes(file.data.subarray(0, 4).toString("hex"))) ||
      ((file.mimetype === "image/avif" || file.mimetype === "image/heic" || file.mimetype === "image/heif") && isIsoBmffImage(file.data, file.mimetype));
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
    this.validateImage(file, "cover_image", MAX_EVENT_COVER_SIZE);

    const ext = extname(file.filename).toLowerCase() || extensionForMime(file.mimetype) || ".jpg";

    const sanitizedKey = `events/${eventId}/cover-${randomUUID()}${ext}`;
    if (!this.isCloudinaryConfigured()) {
      throw new AppError(
        ERROR_CODES.INTERNAL_ERROR,
        "Event image storage is unavailable because Cloudinary is not configured on the API.",
        503,
      );
    }
    return this.uploadToCloudinary(sanitizedKey, file.data, file.mimetype, "image", true);
  }

  async uploadStatusMedia(userId: string, file: { mimetype: string; data: Buffer; filename: string }): Promise<string> {
    if (file.mimetype.startsWith("image/")) {
      this.validateImage(file, "media");
    } else if (ALLOWED_STATUS_VIDEO_MIMES.includes(file.mimetype as (typeof ALLOWED_STATUS_VIDEO_MIMES)[number])) {
      if (file.data.length > MAX_STATUS_VIDEO_SIZE) {
        throw AppError.validation({ media: [`Video size exceeds maximum limit of ${MAX_STATUS_VIDEO_SIZE / (1024 * 1024)}MB`] });
      }
      const ext = extname(file.filename).toLowerCase();
      const validExtensions: Record<string, string[]> = { "video/mp4": [".mp4"], "video/webm": [".webm"], "video/quicktime": [".mov"] };
      if (ext && !validExtensions[file.mimetype]?.includes(ext)) {
        throw AppError.validation({ media: ["File extension does not match the declared video type"] });
      }
    } else {
      throw AppError.validation({ media: ["Choose a JPEG, PNG, WebP, MP4, WebM, or MOV file"] });
    }

    const ext = extname(file.filename).toLowerCase() || extensionForMime(file.mimetype);
    const key = `statuses/${userId}/${randomUUID()}${ext}`;
    if (this.isCloudinaryConfigured()) {
      return this.uploadToCloudinary(key, file.data, file.mimetype, file.mimetype.startsWith("video/") ? "video" : "image");
    }
    const response = await this.request("PUT", key, file.data, file.mimetype);
    if (!response.ok) throw new Error(`Object storage upload failed with status ${response.status}`);
    return this.getPublicUrl(key)!;
  }

  validateChatFile(
    file: { mimetype: string; data: Buffer; filename: string },
    fieldName = "file",
  ): void {
    if (!ALLOWED_CHAT_MIMES.includes(file.mimetype as (typeof ALLOWED_CHAT_MIMES)[number])) {
      throw AppError.validation({
        [fieldName]: [
          `Unsupported file type '${file.mimetype}'. Allowed types include images, video, PDF, text, Word documents, and audio.`,
        ],
      });
    }
    if (file.data.length > MAX_CHAT_FILE_SIZE) {
      throw AppError.validation({
        [fieldName]: [
          `File size exceeds maximum limit of ${MAX_CHAT_FILE_SIZE / (1024 * 1024)}MB`,
        ],
      });
    }
    if (
      file.mimetype.startsWith("image/")
    ) {
      this.validateImage(file, fieldName);
    }
  }

  async uploadChatAttachment(
    conversationId: string,
    messageId: string,
    file: { mimetype: string; data: Buffer; filename: string },
  ): Promise<string> {
    this.validateChatFile(file);
    const ext = extname(file.filename).toLowerCase() || extensionForMime(file.mimetype);
    const key = `chat/${conversationId}/${messageId}/${randomUUID()}${ext}`;
    const response = await this.request("PUT", key, file.data, file.mimetype);
    if (!response.ok) {
      throw new Error(`Object storage upload failed with status ${response.status}`);
    }
    return key;
  }

  async getPrivateObject(key: string): Promise<{ data: Buffer; contentType: string } | null> {
    const storageKey = key.startsWith("http://") || key.startsWith("https://")
      ? this.getStorageKeyFromPublicUrl(key)
      : key.replace(/^\/+/, "");
    if (!storageKey) return null;
    const response = await this.request("GET", storageKey);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Object storage download failed with status ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "application/octet-stream";
    return { data: Buffer.from(await response.arrayBuffer()), contentType };
  }

  async uploadPublicPurposeImage(
    userId: string,
    purpose: string,
    file: { mimetype: string; data: Buffer; filename: string },
  ): Promise<string> {
    this.validateImage(file, "file");
    const ext =
      extname(file.filename).toLowerCase() || extensionForMime(file.mimetype);
    const key = `uploads/${purpose.toLowerCase()}/${userId}/${randomUUID()}${ext}`;
    return this.uploadImage(key, file.data, file.mimetype);
  }

  async uploadPrivateDocument(
    userId: string,
    purpose: string,
    file: { mimetype: string; data: Buffer; filename: string },
  ): Promise<string> {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (!allowed.includes(file.mimetype)) {
      throw AppError.validation({
        file: ["Choose a JPEG, PNG, WebP or PDF file"],
      });
    }
    if (file.mimetype.startsWith("image/")) {
      this.validateImage(file, "file");
    }
    if (file.data.length > 10 * 1024 * 1024) {
      throw AppError.validation({
        file: ["Document size exceeds the 10MB limit"],
      });
    }
    const ext =
      extname(file.filename).toLowerCase() || extensionForMime(file.mimetype);
    const key = `private/${purpose.toLowerCase()}/${userId}/${randomUUID()}${ext}`;
    const response = await this.request("PUT", key, file.data, file.mimetype);
    if (!response.ok) {
      throw new Error(
        `Object storage upload failed with status ${response.status}`,
      );
    }
    return key;
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
      resourceType: "image" | "video" = "image",
      deliverAsJpeg = false,
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
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/upload`,
        { method: "POST", body: form, signal: AbortSignal.timeout(60_000) },
      );
      if (!response.ok) {
        let details = "";
        try {
          const payload = (await response.json()) as { error?: { message?: unknown } };
          if (typeof payload.error?.message === "string") details = `: ${payload.error.message}`;
        } catch {
          // Keep the HTTP status when Cloudinary returns a non-JSON error.
        }
        throw new AppError(
          ERROR_CODES.INTERNAL_ERROR,
          "Cloudinary could not save this image. Try another supported image or contact Eventis support.",
          502,
          { internal: { status: response.status, details } },
        );
      }
      const payload = (await response.json()) as { secure_url?: unknown };
      if (typeof payload.secure_url !== "string" || !payload.secure_url) {
        throw new Error("Cloudinary image upload returned no secure URL");
      }
      return deliverAsJpeg && resourceType === "image"
        ? payload.secure_url.replace("/image/upload/", "/image/upload/f_jpg,q_auto/")
        : payload.secure_url;
    }

  private async deleteCloudinaryFile(url: string): Promise<void> {
      const match = url.match(/\/(image|video)\/upload\/(?:f_jpg,q_auto\/)?(?:v\d+\/)?(.+?)(?:\.[a-zA-Z0-9]+)?$/);
      if (!match?.[1]) return;

      const cloudName = this.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = this.env.CLOUDINARY_API_KEY;
      const apiSecret = this.env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) return;

      const resourceType = match[1];
      const publicId = match[2]!.replace(/\.[^.]+$/, "");
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
        `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${resourceType}/destroy`,
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
    method: "PUT" | "DELETE" | "GET",
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
      signal: AbortSignal.timeout(method === "GET" ? 20_000 : 5000),
    });
  }
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/avif":
      return ".avif";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/bmp":
    case "image/x-ms-bmp":
      return ".bmp";
    case "image/tiff":
    case "image/x-tiff":
      return ".tiff";
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "application/pdf":
      return ".pdf";
    case "text/plain":
      return ".txt";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      return ".m4a";
    case "audio/aac":
      return ".aac";
    case "audio/webm":
      return ".webm";
    case "audio/ogg":
      return ".ogg";
    case "audio/wav":
      return ".wav";
    default:
      return "";
  }
}

function isIsoBmffImage(data: Buffer, mime: string): boolean {
  if (data.length < 12 || data.toString("ascii", 4, 8) !== "ftyp") return false;
  const brands = [data.toString("ascii", 8, 12)];
  for (let offset = 16; offset + 4 <= Math.min(data.length, 64); offset += 4) {
    brands.push(data.toString("ascii", offset, offset + 4));
  }
  if (mime === "image/avif") return brands.some((brand) => brand === "avif" || brand === "avis");
  if (mime === "image/heic") return brands.some((brand) => ["heic", "heix", "hevc", "hevx"].includes(brand));
  return brands.some((brand) => ["mif1", "msf1", "heic", "heix"].includes(brand));
}
