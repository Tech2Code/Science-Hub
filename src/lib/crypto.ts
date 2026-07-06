import crypto from "crypto";

// Encrypts secrets-at-rest (currently: the Gmail app password stored in
// BusinessSettings) using a key derived from NEXTAUTH_SECRET, so no new
// required env var is needed. Values are prefixed "enc:" so existing
// plaintext rows written before this was added are still readable —
// decrypt() passes them through unchanged instead of failing.
const ALGO = "aes-256-gcm";

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
    console.error("crypto.decrypt failed:", err);
    return "";
  }
}
