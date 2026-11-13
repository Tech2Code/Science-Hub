import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBusinessSettings } from "@/lib/db";
import nodemailer from "nodemailer";
import { rateLimitShared, getClientIp } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/html";
import { generateResetToken, hashForKey } from "@/lib/resetToken";

// Always the same response regardless of whether the email is registered (anti-enumeration).
// Must be a fresh NextResponse per call — a Response body can only be serialized once.
function genericOk() {
  return NextResponse.json({ ok: true });
}

// Everything that depends on whether the account exists — the user lookup, the settings read, the token write and
// the SMTP send — runs here, AFTER the response has gone out. Doing any of it before responding (it used to do the
// settings read and two DB writes for a registered email and nothing for an unknown one) made a registered address
// measurably slower to answer, which is enough to enumerate accounts.
async function sendResetEmail(normalizedEmail: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (!user) return;

  // Check Gmail is configured before generating a token
  const biz = await getBusinessSettings();
  const gmailUser = biz.gmailUser || process.env.GMAIL_USER;
  const gmailPass = biz.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.error("forgot-password: email sending is not configured (missing Gmail credentials)");
    return;
  }

  // Invalidate any existing tokens for this user and opportunistic cleanup of expired tokens
  await prisma.passwordResetToken.deleteMany({
    where: {
      OR: [
        { userId: user.id },
        { expiresAt: { lte: new Date() } },
      ],
    },
  });

  // 64-char hex token, expires in 1 hour. Only its SHA-256 hash is stored (see src/lib/resetToken.ts) — the raw
  // value exists only in the emailed link.
  const { raw: rawToken, hash: tokenHash } = generateResetToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: tokenHash, expiresAt },
  });

  const appUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const safeBizName = escapeHtml(biz.name);
  const safeUserName = escapeHtml(user.name);

  await transporter.sendMail({
    from: `"${biz.name}" <${gmailUser}>`,
    to: user.email,
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
  }).catch((err) => console.error("forgot-password: sendMail failed:", err));
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email required." }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    // The email is hashed in the key: rate-limit keys can live in a third-party store (Upstash).
    const [ipLimit, emailLimit] = await Promise.all([
      rateLimitShared(`forgot-password:ip:${getClientIp(req)}`, 10, 15 * 60 * 1000),
      rateLimitShared(`forgot-password:email:${hashForKey(normalizedEmail)}`, 3, 60 * 60 * 1000),
    ]);
    if (!ipLimit.allowed || !emailLimit.allowed) {
      // Still don't reveal whether the account exists — just stop sending.
      return genericOk();
    }

    after(() => sendResetEmail(normalizedEmail).catch((err) => console.error("forgot-password: background work failed:", err)));
    return genericOk();
  } catch (err) {
    // Log full detail server-side only; never expose internal/operational
    // detail (Gmail auth failures, Prisma state, etc.) to the caller.
    console.error("forgot-password error:", err);
    return genericOk();
  }
}
