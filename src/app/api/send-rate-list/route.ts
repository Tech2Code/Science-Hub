import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getBusinessSettings } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/html";
import { requireWriteAccess } from "@/lib/apiAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

// Mirrors /api/send-invoice, but a rate list has no linked customer email to
// default to — the recipient is always typed in by whoever shares it.
export async function POST(req: Request) {
  const auth = await requireWriteAccess();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const limit = rateLimit(`send-rate-list:${session.user.id}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many emails sent. Please try again later." }, { status: 429 });
  }

  try {
    const form = await req.formData();
    const pdf = form.get("pdf") as File | null;
    const to = form.get("to") as string | null;
    const title = form.get("title") as string | null;

    if (!pdf || !to || !title) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (to.trim().length > 254 || !EMAIL_RE.test(to.trim())) {
      return NextResponse.json({ error: "Recipient email address is invalid." }, { status: 400 });
    }
    // title is client-supplied form data — reject any embedded CR/LF before
    // it can reach the `subject` header, or an authenticated caller could
    // inject extra SMTP headers (e.g. Bcc) into a message sent from the
    // business's own Gmail account (mirrors the same fix in /api/send-invoice).
    if (/[\r\n]/.test(title) || title.length > 200) {
      return NextResponse.json({ error: "Invalid rate list title." }, { status: 400 });
    }
    if (pdf.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: "PDF attachment is too large (max 10MB)." }, { status: 413 });
    }

    const buffer = Buffer.from(await pdf.arrayBuffer());
    const biz = await getBusinessSettings();

    const gmailUser = biz.gmailUser || process.env.GMAIL_USER;
    const gmailPass = biz.gmailAppPassword || process.env.GMAIL_APP_PASSWORD;
    if (!gmailUser || !gmailPass) {
      return NextResponse.json({ error: "Email not configured. Set Gmail credentials in Business Settings." }, { status: 503 });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
    });
    const bizAddress = [biz.address, biz.city, biz.state, biz.pincode].filter(Boolean).join(", ");
    const bizFooter = [biz.name, bizAddress, biz.phone ? `Ph: ${biz.phone}` : "", biz.email].filter(Boolean).join(" · ");

    const safeTitle = escapeHtml(title);

    await transporter.sendMail({
      from: `"${biz.name}" <${gmailUser}>`,
      to: to.trim(),
      subject: `${title} — ${biz.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e3a8a">${escapeHtml(biz.name)}</h2>
          <p>Please find the rate list <strong>${safeTitle}</strong> attached to this email.</p>
          <p>Thank you for your business.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0"/>
          <p style="color:#64748b;font-size:0.85rem">${escapeHtml(bizFooter)}</p>
        </div>
      `,
      attachments: [
        { filename: `${title.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`, content: buffer, contentType: "application/pdf" },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-rate-list error:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
