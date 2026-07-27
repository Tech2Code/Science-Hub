import crypto from "crypto";

// Encrypts secrets-at-rest (currently: the Gmail app password and bank
// account number stored in BusinessSettings).
//
// Key material: if a dedicated ENCRYPTION_KEY env var is set, it is used
// (via SHA-256 to normalize it to 32 bytes) and new values are written
// with the "encv2:" prefix — this lets the encryption key be rotated
// independently of NEXTAUTH_SECRET (which also signs login sessions).
// If ENCRYPTION_KEY is not set, behavior is unchanged from before: the key
// is derived from NEXTAUTH_SECRET and values are written with the legacy
// "enc:" prefix. decrypt() recognizes both prefixes and picks the matching
// key, so introducing ENCRYPTION_KEY never breaks reading values written
// before it existed — no migration step is required. Plaintext rows
// written before encryption existed at all (no recognized prefix) are
// passed through unchanged rather than failing.
const ALGO = "aes-256-gcm";

// Thrown by decrypt() when a value can't be decrypted with the current
// key (e.g. the relevant secret was rotated, or this environment's
// secret/key doesn't match the one the value was encrypted with). Distinct
// from "there's no value" so callers can tell a real problem apart from
// an empty field instead of both silently looking like "".
export class DecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt value — the encryption key may not match the one used to encrypt it.");
    this.name = "DecryptionError";
    this.cause = cause;
  }
}

// Legacy key: derived from NEXTAUTH_SECRET. Still used to decrypt any
// value written before ENCRYPTION_KEY existed, and to encrypt new values
// when ENCRYPTION_KEY isn't configured.
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

// Throws DecryptionError if the value is prefixed "enc:"/"encv2:" but can't
// be decrypted with the matching key. Callers that can tolerate a failure
// (and want to surface it rather than crash) should use safeDecrypt().
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
