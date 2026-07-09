import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/db";
import { rateLimit } from "@/lib/rateLimit";
import { escapeHtml } from "@/lib/html";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = rateLimit(`send-invoice:${session.user.id}`, 20, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too many emails sent. Please try again later." }, { status: 429 });
  }

  try {
    const form = await req.formData();
    const pdf = form.get("pdf") as File | null;
    const to = form.get("to") as string | null;
    const invoiceNumber = form.get("invoiceNumber") as string | null;
    const customerName = form.get("customerName") as string | null;
    const total = form.get("total") as string | null;

    if (!pdf || !to || !invoiceNumber) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!EMAIL_RE.test(to.trim())) {
      return NextResponse.json({ error: "Recipient email address is invalid." }, { status: 400 });
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

    const safeInvoiceNumber = escapeHtml(invoiceNumber);
    const safeCustomerName = escapeHtml(customerName ?? "Customer");
    const safeTotal = total ? escapeHtml(total) : "";

    await transporter.sendMail({
      from: `"${biz.name}" <${gmailUser}>`,
      to: to.trim(),
      subject: `Invoice ${invoiceNumber} — ${biz.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e3a8a">${escapeHtml(biz.name)}</h2>
          <p>Dear ${safeCustomerName},</p>
          <p>Please find your invoice <strong>${safeInvoiceNumber}</strong> attached to this email.</p>
          ${safeTotal ? `<p>Invoice Amount: <strong>₹${safeTotal}</strong></p>` : ""}
          <p>Thank you for your business.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0"/>
          <p style="color:#64748b;font-size:0.85rem">${escapeHtml(bizFooter)}</p>
        </div>
      `,
      attachments: [
        { filename: `${invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`, content: buffer, contentType: "application/pdf" },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-invoice error:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
