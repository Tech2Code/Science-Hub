import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInvoices } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { requireSession } from "@/lib/apiAuth";
import { recordStockMovement } from "@/lib/stockMovement";

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
    const { items, notes, dueDate, isInterState, placeOfSupply, reverseCharge, customCustomer } = body;
    let { customerId } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }
    if (!placeOfSupply || !String(placeOfSupply).trim()) {
      return NextResponse.json({ error: "Place of supply is required" }, { status: 400 });
    }
    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (parsedDueDate < today) {
        return NextResponse.json({ error: "Due date cannot be in the past" }, { status: 400 });
      }
    }
    for (const item of items as { quantity?: number; qty?: number; price: number; gstRate?: number; discountPercent?: number }[]) {
      const quantity = parseFloat(String(item.quantity ?? item.qty ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? 0));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      if (!(quantity > 0)) {
        return NextResponse.json({ error: "Item quantity must be greater than 0" }, { status: 400 });
      }
      if (!(price >= 0)) {
        return NextResponse.json({ error: "Item price cannot be negative" }, { status: 400 });
      }
      if (!(gstRate >= 0)) {
        return NextResponse.json({ error: "Item GST rate cannot be negative" }, { status: 400 });
      }
      if (!(discountPercent >= 0 && discountPercent <= 100)) {
        return NextResponse.json({ error: "Item discount must be between 0 and 100%" }, { status: 400 });
      }
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

    const currentYear = new Date().getFullYear();

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
      hsn?: string;
      discountPercent?: number;
    }) => {
      const product = productMap.get(item.productId);
      const quantity = parseFloat(String(item.quantity ?? item.qty ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? product?.gstRate ?? 18));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      const grossAmount = price * quantity;
      const discountAmount = (grossAmount * discountPercent) / 100;
      const itemSubtotal = grossAmount - discountAmount;
      const gstAmount = (itemSubtotal * gstRate) / 100;
      const itemTotal = itemSubtotal + gstAmount;

      subtotal += itemSubtotal;
      totalGst += gstAmount;

      return {
        productId: item.productId,
        name: product?.name ?? "Unknown Product",
        hsn: (item.hsn ?? product?.hsn ?? "").trim(),
        quantity,
        unit: product?.unit ?? "Nos",
        price,
        discountPercent,
        discountAmount,
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

    // Invoice-number generation (highest-existing-number-for-year + 1) and the
    // create both run inside one Serializable transaction, with a retry on the
    // write-conflict Postgres reports when two requests race for the same
    // number — without this, concurrent requests would hand out duplicate
    // invoice numbers instead of one of them safely retrying.
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        const lastInvoiceThisYear = await tx.invoice.findFirst({
          where: { invoiceNumber: { startsWith: `SH-${currentYear}-` } },
          orderBy: { invoiceNumber: "desc" },
          select: { invoiceNumber: true },
        });
        const lastSequentialNumber = lastInvoiceThisYear
          ? parseInt(lastInvoiceThisYear.invoiceNumber.split("-")[2], 10)
          : 0;
        const sequentialNumber = String(lastSequentialNumber + 1).padStart(4, "0");
        const invoiceNumber = `SH-${currentYear}-${sequentialNumber}`;

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
            placeOfSupply: String(placeOfSupply).trim(),
            reverseCharge: Boolean(reverseCharge),
            items: { create: invoiceItems },
          },
          include: { customer: true, items: true },
        });

        const warnings: string[] = [];
        for (const item of invoiceItems as { productId: string; quantity: number }[]) {
          const product = await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
            select: { id: true, name: true, stock: true },
          });
          if (product.stock < 0) warnings.push(`${product.name} (stock: ${product.stock})`);
          await recordStockMovement(tx, {
            productId: product.id,
            type: "sale",
            quantity: -item.quantity,
            balanceAfter: product.stock,
            reference: inv.invoiceNumber,
            createdByUserId: user.id,
          });
        }

        return { invoice: inv, stockWarnings: warnings };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
    }

    const maxAttempts = 5;
    let result: Awaited<ReturnType<typeof attemptCreate>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        result = await attemptCreate();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }
    const { invoice, stockWarnings } = result!;

    await logActivity(user.id, "create_invoice", `Created invoice ${invoice.invoiceNumber} for ${invoice.customer.name} | Total: ₹${invoice.total.toFixed(2)} | Items: ${invoiceItems.length} | Tax: ${isInterState ? "IGST" : "CGST+SGST"}`, invoice.id, "invoice");
    revalidateTag("invoices", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json({ ...invoice, stockWarnings }, { status: 201 });
  } catch (error) {
    console.error("POST /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
