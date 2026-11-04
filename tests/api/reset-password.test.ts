import { describe, it, expect, beforeEach, vi } from "vitest";
import { hasTestDatabase, testPrisma, resetDb, seedUser } from "../helpers/db";
import { jsonRequest } from "../helpers/request";
import { generateResetToken } from "@/lib/resetToken";

vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

// Reset tokens are stored as SHA-256 hashes; only the emailed (raw) value is accepted.
describe.skipIf(!hasTestDatabase)("POST /api/auth/reset-password", () => {
  let userId: string;

  beforeEach(async () => {
    await resetDb();
    userId = (await seedUser({ role: "staff" })).id;
  });

  const post = async (token: string, password = "NewPassw0rd!") => {
    const { POST } = await import("@/app/api/auth/reset-password/route");
    return POST(jsonRequest("http://localhost/api/auth/reset-password", "POST", { token, password }));
  };

  it("accepts the raw token whose hash is stored, once", async () => {
    const { raw, hash } = generateResetToken();
    await testPrisma.passwordResetToken.create({ data: { userId, token: hash, expiresAt: new Date(Date.now() + 3600_000) } });
    expect((await post(raw)).status).toBe(200);
    const again = await post(raw);
    expect(again.status).toBe(400);
  });

  it("does not accept the stored hash itself as a token (a leaked DB row is not a working link)", async () => {
    const { hash } = generateResetToken();
    await testPrisma.passwordResetToken.create({ data: { userId, token: hash, expiresAt: new Date(Date.now() + 3600_000) } });
    expect((await post(hash)).status).toBe(400);
  });

  it("rejects an expired token", async () => {
    const { raw, hash } = generateResetToken();
    await testPrisma.passwordResetToken.create({ data: { userId, token: hash, expiresAt: new Date(Date.now() - 1000) } });
    expect((await post(raw)).status).toBe(400);
  });
});
