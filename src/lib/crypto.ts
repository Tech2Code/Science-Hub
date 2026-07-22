import crypto from "crypto";

// Encrypts secrets-at-rest (currently: the Gmail app password and bank
// account number stored in BusinessSettings) using a key derived from
// NEXTAUTH_SECRET, so no new required env var is needed. Values are
// prefixed "enc:" so existing plaintext rows written before this was
// added are still readable — decrypt() passes them through unchanged
// instead of failing.
const ALGO = "aes-256-gcm";

// Thrown by decrypt() when a value can't be decrypted with the current
// NEXTAUTH_SECRET (e.g. the secret was rotated, or this environment's
// secret doesn't match the one the value was encrypted with). Distinct
// from "there's no value" so callers can tell a real problem apart from
// an empty field instead of both silently looking like "".
export class DecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt value — NEXTAUTH_SECRET may not match the key used to encrypt it.");
    this.name = "DecryptionError";
    this.cause = cause;
  }
}

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET environment variable is required");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

// Throws DecryptionError if the value is prefixed "enc:" but can't be
// decrypted with the current key. Callers that can tolerate a failure
// (and want to surface it rather than crash) should use safeDecrypt().
export function decrypt(value: string): string {
  if (!value.startsWith("enc:")) return value;
  const [, ivHex, tagHex, dataHex] = value.split(":");
  try {
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (err) {
    throw new DecryptionError(err);
  }
}

// Non-throwing variant for read paths that must keep returning a settings
// object even when a secret can't be decrypted (e.g. a mismatched
// NEXTAUTH_SECRET in a preview environment) — reports the failure via
// `failed` instead of silently coming back as an empty string, so the
// caller can tell "not configured" apart from "configured but broken".
export function safeDecrypt(value: string): { value: string; failed: boolean } {
  try {
    return { value: decrypt(value), failed: false };
  } catch (err) {
    // Expected and fully handled by the caller (surfaced via the `failed`
    // flag → a UI warning banner) — not an app error, so this stays a
    // warn rather than console.error, which Next.js dev intercepts and
    // renders as a full-screen "Server Console Error" overlay.
    console.warn("crypto.safeDecrypt: could not decrypt value —", (err as Error).message);
    return { value: "", failed: true };
  }
}
