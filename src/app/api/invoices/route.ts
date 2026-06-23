import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { getInvoices } from "@/lib/db";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    const invoices = await getInvoices(status, customerId);
    return NextResponse.json(invoices);
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    // Fall back to first admin user if session not available (dev mode)
    let user = session?.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email } })
      : null;

    if (!user) {
      user = await prisma.user.findFirst({ where: { role: "admin" } });
    }

    if (!user) {
      return NextResponse.json({ error: "No user found. Please log in." }, { status: 401 });
    }

    const body = await request.json();
    const { customerId, items, notes, dueDate, isInterState } = body;

    if (!customerId || !items || items.length === 0) {
      return NextResponse.json(
        { error: "customerId and items are required" },
        { status: 400 }
      );
    }

    // Generate invoice number: SH-{YYYY}-{0001}
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(`${currentYear}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${currentYear + 1}-01-01T00:00:00.000Z`);

    const invoiceCountThisYear = await prisma.invoice.count({
      where: {
        date: {
          gte: yearStart,
          lt: yearEnd,
        },
      },
    });

    const sequentialNumber = String(invoiceCountThisYear + 1).padStart(4, "0");
    const invoiceNumber = `SH-${currentYear}-${sequentialNumber}`;

    // Fetch product details for each item
    const productIds = items.map((item: { productId: string }) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calculate totals
    let subtotal = 0;
    let totalGst = 0;

    const invoiceItems = items.map((item: {
      productId: string;
      quantity?: number;
      qty?: number;
      price: number;
      gstRate: number;
    }) => {
      const product = productMap.get(item.productId);
      const quantity = parseFloat(String(item.quantity ?? item.qty ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? product?.gstRate ?? 18));
      const itemSubtotal = price * quantity;
      const gstAmount = (itemSubtotal * gstRate) / 100;
      const itemTotal = itemSubtotal + gstAmount;

      subtotal += itemSubtotal;
      totalGst += gstAmount;

      return {
        productId: item.productId,
        name: product?.name ?? "Unknown Product",
        quantity,
        unit: product?.unit ?? "Nos",
        price,
        gstRate,
        gstAmount,
        total: itemTotal,
      };
    });

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isInterState) {
      igst = totalGst;
    } else {
      cgst = totalGst / 2;
      sgst = totalGst / 2;
    }

    const total = subtotal + cgst + sgst + igst;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        customerId,
        userId: user.id,
        status: "unpaid",
        subtotal,
        cgst,
        sgst,
        igst,
        total,
        paidAmount: 0,
        notes: notes || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        isInterState: Boolean(isInterState),
        items: {
          create: invoiceItems,
        },
      },
      include: {
        customer: true,
        items: true,
      },
    });

    revalidateTag("invoices", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    await logActivity(user.id, "create_invoice", `Created invoice ${invoiceNumber} for ${invoice.customer.name}`, invoice.id, "invoice");
    return NextResponse.json(invoice, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
