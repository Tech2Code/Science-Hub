import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/db";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { rateLimit, getClientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/html";

// Always resolves to the same generic response, whether or not the email is
// registered — the caller must not be able to distinguish the two cases.
// Must be a fresh NextResponse per call — a Response body can only be
// serialized once, so a shared singleton instance returns an empty body on
// every request after the first.
function genericOk() {
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required." }, { status: 400 });
    }

    const ipLimit = rateLimit(`forgot-password:ip:${getClientIp(req)}`, 10, 15 * 60 * 1000);
    const emailLimit = rateLimit(`forgot-password:email:${email.trim().toLowerCase()}`, 3, 60 * 60 * 1000);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      // Still don't reveal whether the account exists — just stop sending.
      return genericOk();
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user) {
      // Same response as success — do not leak account existence.
      return genericOk();
    }

    // Check Gmail is configured before generating token
    const biz = await getBusinessSettings();
    const gmailUser = biz.gmailUser || process.env.GMAIL_USER;
    const gmailPass = biz.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      console.error("forgot-password: email sending is not configured (missing Gmail credentials)");
      return genericOk();
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

    // Send after the response is returned, not before — otherwise a
    // registered vs. unregistered email is distinguishable purely from how
    // long the request takes (this branch awaits an SMTP round-trip, the
    // "unregistered" branch above returns immediately).
    const safeBizName = escapeHtml(biz.name);
    const safeUserName = escapeHtml(user.name);

    after(() =>
      transporter.sendMail({
        from: `"${biz.name}" <${gmailUser}>`,
        to: email,
        subject: `Reset your ${biz.name} password`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#1e3a8a">${safeBizName}</h2>
            <p>Hi ${safeUserName},</p>
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
            <p style="color:#94a3b8;font-size:0.8rem">${safeBizName}</p>
          </div>
        `,
      }).catch(err => console.error("forgot-password: sendMail failed:", err))
    );

    return genericOk();
  } catch (err) {
    // Log full detail server-side only; never expose internal/operational
    // detail (Gmail auth failures, Prisma state, etc.) to the caller.
    console.error("forgot-password error:", err);
    return genericOk();
  }
}
