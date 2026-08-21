import crypto from "crypto";

// Encrypts secrets-at-rest (Gmail app password, bank account number). Uses ENCRYPTION_KEY when set (prefix "encv2:") so it can rotate independently of NEXTAUTH_SECRET,
// else derives from NEXTAUTH_SECRET (prefix "enc:"); decrypt() recognizes both, and unprefixed legacy plaintext passes through unchanged.
const ALGO = "aes-256-gcm";

// Thrown when the key doesn't match what a value was encrypted with — distinct from "no value" so callers don't conflate the two.
export class DecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt value — the encryption key may not match the one used to encrypt it.");
    this.name = "DecryptionError";
    this.cause = cause;
  }
}

// Legacy key, derived from NEXTAUTH_SECRET; used when ENCRYPTION_KEY isn't configured.
function getLegacyKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET environment variable is required");
  return crypto.createHash("sha256").update(secret).digest();
}

// Dedicated key: derived from ENCRYPTION_KEY when set, independent of
// NEXTAUTH_SECRET so the two can be rotated separately.
function getDedicatedKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY environment variable is required");
  return crypto.createHash("sha256").update(key).digest();
}

export function encrypt(plaintext: string): string {
  const useDedicated = Boolean(process.env.ENCRYPTION_KEY);
  const key = useDedicated ? getDedicatedKey() : getLegacyKey();
  const prefix = useDedicated ? "encv2" : "enc";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${prefix}:${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

// Throws DecryptionError if a prefixed value can't be decrypted; use safeDecrypt() to tolerate failure instead.
export function decrypt(value: string): string {
  const isV2 = value.startsWith("encv2:");
  const isLegacy = !isV2 && value.startsWith("enc:");
  if (!isV2 && !isLegacy) return value;

  const [, ivHex, tagHex, dataHex] = value.split(":");
  try {
    const key = isV2 ? getDedicatedKey() : getLegacyKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  } catch (err) {
    throw new DecryptionError(err);
  }
}

// Non-throwing variant — reports failure via `failed` so callers can tell "not configured" apart from "configured but broken".
export function safeDecrypt(value: string): { value: string; failed: boolean } {
  try {
    return { value: decrypt(value), failed: false };
  } catch (err) {
    // warn (not error) — this is expected/handled via `failed`, and console.error triggers Next dev's full-screen overlay.
    console.warn("crypto.safeDecrypt: could not decrypt value —", (err as Error).message);
    return { value: "", failed: true };
  }
}
