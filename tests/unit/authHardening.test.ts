import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { BCRYPT_COST, DUMMY_PASSWORD_HASH } from "@/lib/passwordHash";
import { generateResetToken, hashResetToken, hashForKey } from "@/lib/resetToken";

describe("login timing: the dummy hash must cost what a real hash costs", () => {
  it("DUMMY_PASSWORD_HASH uses the same work factor real users' hashes are created with", () => {
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(BCRYPT_COST);
  });

  it("a real hash created by the app's own cost verifies to the same rounds as the dummy", async () => {
    const real = await bcrypt.hash("whatever-password", BCRYPT_COST);
    expect(bcrypt.getRounds(real)).toBe(bcrypt.getRounds(DUMMY_PASSWORD_HASH));
  });

  it("the dummy hash is a valid bcrypt hash that no ordinary password matches", async () => {
    expect(await bcrypt.compare("password", DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await bcrypt.compare("", DUMMY_PASSWORD_HASH)).toBe(false);
  });

  // Drift guard: a hash made with a different literal cost (the old dummy was 10 vs. 12) reopens the timing leak.
  it("every bcrypt.hash() call in src uses BCRYPT_COST, never a literal", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
      }
    };
    walk(path.join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const f of files) {
      for (const line of fs.readFileSync(f, "utf8").split("\n")) {
        if (/bcrypt\.hash(Sync)?\(/.test(line) && !line.includes("BCRYPT_COST")) offenders.push(`${path.relative(process.cwd(), f)}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("password-reset tokens are stored hashed", () => {
  it("generateResetToken returns a 64-hex raw token and a different 64-hex hash of it", () => {
    const { raw, hash } = generateResetToken();
    expect(raw).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(raw);
    expect(hashResetToken(raw)).toBe(hash);
  });

  it("two tokens never collide, and hashing is deterministic and input-sensitive", () => {
    const a = generateResetToken(); const b = generateResetToken();
    expect(a.raw).not.toBe(b.raw);
    expect(a.hash).not.toBe(b.hash);
    expect(hashResetToken("abc")).toBe(hashResetToken("abc"));
    expect(hashResetToken("abc")).not.toBe(hashResetToken("abd"));
  });
});

describe("rate-limit keys keep the email out of the third-party store", () => {
  it("hashForKey is stable, short, and does not contain the input", () => {
    const email = "someone@example.com";
    const k = hashForKey(email);
    expect(k).toBe(hashForKey(email));
    expect(k).toHaveLength(32);
    expect(k).not.toContain("someone");
    expect(hashForKey("a@example.com")).not.toBe(hashForKey("b@example.com"));
  });
});
