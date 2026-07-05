import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getInvoices } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const user = auth.session.user;

    const body = await request.json();
    const { items, notes, dueDate, isInterState, customCustomer } = body;
    let { customerId } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }

    // If no existing customer selected, create one from the custom details
    if (!customerId) {
      if (!customCustomer?.name?.trim()) {
        return NextResponse.json({ error: "Customer name is required" }, { status: 400 });
      }
      if (!customCustomer?.phone?.trim()) {
        return NextResponse.json({ error: "Customer phone number is required" }, { status: 400 });
      }
      const newCustomer = await prisma.customer.create({
        data: {
          name: customCustomer.name.trim(),
          phone:   customCustomer.phone?.trim()   || null,
          email:   customCustomer.email?.trim()   || null,
          address: customCustomer.address?.trim() || null,
          city:    customCustomer.city?.trim()    || null,
          state:   customCustomer.state?.trim()   || null,
          pincode: customCustomer.pincode?.trim() || null,
          gstin:   customCustomer.gstin?.trim()   || null,
        },
      });
      customerId = newCustomer.id;
      await logActivity(user.id, "add_customer", `Added customer "${newCustomer.name}" (via invoice) | Phone: ${newCustomer.phone || "—"} | City: ${newCustomer.city || "—"}`, newCustomer.id, "customer");
      revalidateTag("customers", { expire: 0 });
    }

    // Generate invoice number: SH-{YYYY}-{0001}
    // Derived from the highest existing number for the year (not a row count) so that
    // permanently-deleted invoices don't free up a number that collides with a later one.
    const currentYear = new Date().getFullYear();

    const lastInvoiceThisYear = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: `SH-${currentYear}-` } },
      orderBy: { invoiceNumber: "desc" },
      select: { invoiceNumber: true },
    });

    const lastSequentialNumber = lastInvoiceThisYear
      ? parseInt(lastInvoiceThisYear.invoiceNumber.split("-")[2], 10)
      : 0;
    const sequentialNumber = String(lastSequentialNumber + 1).padStart(4, "0");
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

    const { invoice, stockWarnings } = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
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
          items: { create: invoiceItems },
        },
        include: { customer: true, items: true },
      });

      // Deduct stock for each item
      const warnings: string[] = [];
      for (const item of invoiceItems) {
        await tx.product.updateMany({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        });
        const prod = await tx.product.findUnique({
          where: { id: item.productId },
          select: { name: true, stock: true },
        });
        if (prod && prod.stock < 0) {
          warnings.push(`${prod.name} (stock: ${prod.stock})`);
        }
      }

      return { invoice: inv, stockWarnings: warnings };
    });

    await logActivity(user.id, "create_invoice", `Created invoice ${invoiceNumber} for ${invoice.customer.name} | Total: ₹${invoice.total.toFixed(2)} | Items: ${invoiceItems.length} | Tax: ${isInterState ? "IGST" : "CGST+SGST"}`, invoice.id, "invoice");
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ ...invoice, stockWarnings }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
