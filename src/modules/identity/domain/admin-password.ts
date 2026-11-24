import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// OWASP's 32 MiB scrypt profile. Bound memory and CPU parameters on verification.
const OPTIONS = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
export function validateAdminPassword(password: string): void {
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 256) {
    throw new Error(
      "Admin passwords must contain at least 12 characters and at most 256 UTF-8 bytes.",
    );
  }
}
export async function hashAdminPassword(password: string): Promise<string> {
  validateAdminPassword(password);
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `scrypt$32768$8$3$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifyAdminPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!password || Buffer.byteLength(password, "utf8") > 256) return false;
  const parts = hash.split("$");
  if (
    parts.length !== 6 ||
    parts[0] !== "scrypt" ||
    parts[1] !== "32768" ||
    parts[2] !== "8" ||
    parts[3] !== "3" ||
    !/^[a-f0-9]{32}$/.test(parts[4] ?? "") ||
    !/^[a-f0-9]{128}$/.test(parts[5] ?? "")
  )
    return false;
  const actual = await derive(password, Buffer.from(parts[4]!, "hex"));
  return timingSafeEqual(actual, Buffer.from(parts[5]!, "hex"));
}
// Missing/disabled/non-admin accounts still incur the same password derivation.
let dummyHash: Promise<string> | undefined;
export function getDummyAdminPasswordHash(): Promise<string> {
  dummyHash ??= hashAdminPassword(randomBytes(32).toString("base64url"));
  return dummyHash;
}
