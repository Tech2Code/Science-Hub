import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getBusinessSettings } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/html";
import { requireWriteAccess } from "@/lib/apiAuth";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  const auth = await requireWriteAccess();
  if (!auth.ok) return auth.response;
  const { session } = auth;

  const limit = rateLimit(`send-purchase-bill:${session.user.id}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many emails sent. Please try again later." }, { status: 429 });
  }

  try {
    const form = await req.formData();
    const pdf = form.get("pdf") as File | null;
    const to = form.get("to") as string | null;
    const billNumber = form.get("billNumber") as string | null;
    const vendorName = form.get("vendorName") as string | null;
    const total = form.get("total") as string | null;

    if (!pdf || !to || !billNumber) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    // Supports a comma-separated list so a bill can go to more than one
    // recipient (e.g. vendor + their accountant) in a single send.
    const recipients = to.split(",").map(e => e.trim()).filter(Boolean);
    if (recipients.length === 0) {
      return NextResponse.json({ error: "Recipient email address is invalid." }, { status: 400 });
    }
    if (recipients.length > 10) {
      return NextResponse.json({ error: "Too many recipients (max 10)." }, { status: 400 });
    }
    for (const addr of recipients) {
      if (addr.length > 254 || !EMAIL_RE.test(addr)) {
        return NextResponse.json({ error: `"${addr}" is not a valid email address.` }, { status: 400 });
      }
    }
    // Reject embedded CR/LF before it reaches the `subject` header, or a caller could inject extra SMTP headers (e.g. Bcc).
    if (/[\r\n]/.test(billNumber) || billNumber.length > 100) {
      return NextResponse.json({ error: "Invalid bill number." }, { status: 400 });
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

    // Nodemailer's default 10-min socket timeout would otherwise hang this serverless function until the platform's own limit kills it — fail fast instead.
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: gmailUser, pass: gmailPass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    const bizAddress = [biz.address, biz.city, biz.state, biz.pincode].filter(Boolean).join(", ");
    const bizFooter = [biz.name, bizAddress, biz.phone ? `Ph: ${biz.phone}` : "", biz.email].filter(Boolean).join(" · ");

    const safeBillNumber = escapeHtml(billNumber);
    const safeVendorName = escapeHtml(vendorName ?? "Vendor");
    const safeTotal = total ? escapeHtml(total) : "";

    await transporter.sendMail({
      from: `"${biz.name}" <${gmailUser}>`,
      to: recipients,
      subject: `Purchase Bill ${billNumber} — ${biz.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e3a8a">${escapeHtml(biz.name)}</h2>
          <p>Dear ${safeVendorName},</p>
          <p>Please find purchase bill <strong>${safeBillNumber}</strong> attached to this email.</p>
          ${safeTotal ? `<p>Bill Amount: <strong>₹${safeTotal}</strong></p>` : ""}
          <p>Thank you.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0"/>
          <p style="color:#64748b;font-size:0.85rem">${escapeHtml(bizFooter)}</p>
        </div>
      `,
      attachments: [
        { filename: `${billNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`, content: buffer, contentType: "application/pdf" },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-purchase-bill error:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
