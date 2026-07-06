import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const limit = rateLimit(`reset-password:${getClientIp(req)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    }

    const record = await prisma.passwordResetToken.findUnique({ where: { token } });

    if (!record) {
      return NextResponse.json({ error: "Invalid or expired reset link." }, { status: 400 });
    }
    if (record.usedAt) {
      return NextResponse.json({ error: "This reset link has already been used." }, { status: 400 });
    }
    if (record.expiresAt < new Date()) {
      return NextResponse.json({ error: "This reset link has expired. Request a new one." }, { status: 400 });
    }

    const hashed = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: hashed, tokenVersion: { increment: 1 } } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Failed to reset password." }, { status: 500 });
  }
}
