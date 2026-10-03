import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

import type { PasswordHasher } from "../application/password-hasher.js";

const scrypt = promisify(scryptCallback);

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString("hex");

    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

    return `scrypt$${salt}$${derivedKey.toString("hex")}`;
  }
}