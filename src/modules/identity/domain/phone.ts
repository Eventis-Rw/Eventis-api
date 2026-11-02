const RWANDA_MOBILE = /^(\+?250|0)?(7[2389]\d{7})$/;

export class PhoneNormalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhoneNormalizationError";
  }
}


export function normalizeRwandaPhone(raw: string): string {
  const digits = raw.trim().replace(/[\s\-().]/g, "");
  const match = RWANDA_MOBILE.exec(digits);
  if (!match) {
    throw new PhoneNormalizationError(
      "phone must be a Rwandan mobile number (+25072/73/78/79…)",
    );
  }
  return `+250${match[2]}`;
}
