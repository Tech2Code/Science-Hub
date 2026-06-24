import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/db";
import nodemailer from "nodemailer";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ error: "Email required." }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success — never reveal whether an email is registered
    if (!user) return NextResponse.json({ ok: true });

    // Check Gmail is configured before generating token
    const biz = await getBusinessSettings();
    const gmailUser = biz.gmailUser || process.env.GMAIL_USER;
    const gmailPass = biz.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      return NextResponse.json(
        { error: "Email sending is not configured. Contact your administrator." },
        { status: 503 }
      );
    }

    // Invalidate any existing unexpired tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    });

    // Generate a secure 64-char hex token, expires in 1 hour
    const rawToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, token: rawToken, expiresAt },
    });

    const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });

    await transporter.sendMail({
      from: `"${biz.name}" <${gmailUser}>`,
      to: email,
      subject: `Reset your ${biz.name} password`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e3a8a">${biz.name}</h2>
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password. Click the button below — this link is valid for <strong>1 hour</strong>.</p>
          <div style="text-align:center;margin:2rem 0">
            <a href="${resetUrl}"
               style="display:inline-block;padding:0.75rem 2rem;background:#2563eb;color:#fff;border-radius:0.5rem;text-decoration:none;font-weight:600;font-size:0.9375rem">
              Reset Password
            </a>
          </div>
          <p style="color:#64748b;font-size:0.85rem">
            Or paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color:#2563eb;word-break:break-all">${resetUrl}</a>
          </p>
          <p style="color:#64748b;font-size:0.85rem">If you didn't request a password reset, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0"/>
          <p style="color:#94a3b8;font-size:0.8rem">${biz.name}</p>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("forgot-password error:", msg);
    const friendly = msg.includes("Invalid login") || msg.includes("535") || msg.includes("auth")
      ? "Gmail rejected the credentials. Check the App Password in Business Settings."
      : msg.includes("passwordResetToken") || msg.includes("does not exist")
      ? "Server not ready — run `npx prisma generate` and restart."
      : "Failed to send reset email.";
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
