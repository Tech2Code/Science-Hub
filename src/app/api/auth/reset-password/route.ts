import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { BCRYPT_COST } from "@/lib/passwordHash";
import { rateLimitShared, getClientIp } from "@/lib/rateLimit";
import { validateUserInput } from "@/lib/validation";
import { hashResetToken } from "@/lib/resetToken";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password || typeof token !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
    }
    // Shared validator enforces bcrypt's 72-BYTE cap — the previous char-length check let a
    // multi-byte password under 72 chars through, which bcrypt then silently truncated.
    const pwErr = validateUserInput({ password });
    if (pwErr) return NextResponse.json({ error: `${pwErr}.` }, { status: 400 });

    const limit = await rateLimitShared(`reset-password:${getClientIp(req)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    // Tokens are stored hashed (see src/lib/resetToken.ts); the emailed value is only ever the raw token.
    const record = await prisma.passwordResetToken.findUnique({ where: { token: hashResetToken(token) } });

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }
    if (record.usedAt) {
      return NextResponse.json({ error: "This reset link has already been used." }, { status: 400 });
    }
    if (record.expiresAt < new Date()) {
      return NextResponse.json({ error: "This reset link has expired. Request a new one." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, BCRYPT_COST);

    // Claim the token atomically (only while usedAt is still null) — two concurrent submits of the
    // same link could otherwise both pass the usedAt check above and both reset the password.
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.passwordResetToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
      if (count === 0) return false;
      await tx.user.update({ where: { id: record.userId }, data: { password: hashed, tokenVersion: { increment: 1 } } });
      return true;
    });
    if (!claimed) {
      return NextResponse.json({ error: "This reset link has already been used." }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Failed to reset password." }, { status: 500 });
  }
}
