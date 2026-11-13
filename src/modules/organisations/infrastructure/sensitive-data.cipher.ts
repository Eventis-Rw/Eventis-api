import { Inject, Injectable } from "@nestjs/common";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

import { ENV, type Env } from "../../../config/env.js";

@Injectable()
export class SensitiveDataCipher {
  private readonly key: Buffer;

  constructor(@Inject(ENV) env: Env) {
    this.key = scryptSync(
      env.JWT_ACCESS_SECRET,
      "eventis-sensitive-data-v1",
      32,
    );
  }

  encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      "v1",
      iv.toString("base64url"),
      tag.toString("base64url"),
      encrypted.toString("base64url"),
    ].join(".");
  }

  decrypt(value: string): string {
    const [version, ivPart, tagPart, dataPart] = value.split(".");
    if (version !== "v1" || !ivPart || !tagPart || !dataPart) {
      throw new Error("Unsupported encrypted value");
    }
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
