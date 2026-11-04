import crypto from "crypto";

// Password-reset tokens are random 256-bit values emailed to the user and stored only as their SHA-256 hash, so a
// leaked database backup or read-only DB access cannot be turned into working reset links. (A fast hash is right here:
// the input is 256 bits of randomness, not a guessable password.)
export function hashResetToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function generateResetToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString("hex");
  return { raw, hash: hashResetToken(raw) };
}

// Rate-limit keys can end up in a third-party store (Upstash) — keep the user's email out of them.
export function hashForKey(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}
