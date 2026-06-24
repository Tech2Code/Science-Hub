import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();

    if (!token || !password) {
      return NextResponse.json({ error: "Token and password are required." }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
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

    const hashed = await bcrypt.hash(password, 10);

    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json({ error: "Failed to reset password." }, { status: 500 });
  }
}
