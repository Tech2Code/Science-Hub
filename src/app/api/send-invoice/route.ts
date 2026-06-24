import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getBusinessSettings } from "@/lib/db";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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

    await transporter.sendMail({
      from: `"${biz.name}" <${gmailUser}>`,
      to,
      subject: `Invoice ${invoiceNumber} — ${biz.name}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#1e3a8a">${biz.name}</h2>
          <p>Dear ${customerName ?? "Customer"},</p>
          <p>Please find your invoice <strong>${invoiceNumber}</strong> attached to this email.</p>
          ${total ? `<p>Invoice Amount: <strong>₹${total}</strong></p>` : ""}
          <p>Thank you for your business.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:1.5rem 0"/>
          <p style="color:#64748b;font-size:0.85rem">${bizFooter}</p>
        </div>
      `,
      attachments: [
        { filename: `${invoiceNumber}.pdf`, content: buffer, contentType: "application/pdf" },
      ],
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("send-invoice error:", err);
    return NextResponse.json({ error: "Failed to send email." }, { status: 500 });
  }
}
