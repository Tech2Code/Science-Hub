import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getInvoices, getBusinessSettings, type InvoiceSort } from "@/lib/db";
import { deriveIsInterState } from "@/lib/gstLocation";
import { deriveDefaultPrefix, computeNextNumber, numberFormatDbFilter, getIndianFinancialYear, formatFinancialYearLabel } from "@/lib/documentNumbering";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { computeRoundOff } from "@/lib/roundOff";
import { lineBreakdown } from "@/lib/invoiceCalc";
import { parsePageParams, monthYearToDateRange } from "@/lib/listQuery";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const customerId = searchParams.get("customerId");
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as InvoiceSort | undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const { skip, take } = parsePageParams(searchParams);

    const { data, total } = await getInvoices({ status, customerId, search, dateRange }, sort, skip, take);
    return NextResponse.json({ data, total });
  } catch (error) {
    console.error("GET /api/invoices error:", error);
    return NextResponse.json({ error: "Failed to fetch invoices" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const user = auth.session.user;

    const body = await request.json();
    const { items, notes, dueDate, isInterState: clientIsInterState, placeOfSupply, reverseCharge } = body;
    const { customerId } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }
    if (!placeOfSupply || !String(placeOfSupply).trim()) {
      return NextResponse.json({ error: "Place of supply is required" }, { status: 400 });
    }

    // Independently verify inter-state vs. intra-state from the business's
    // own configured state rather than trusting the client-supplied flag —
    // the browser derives it the same way, so this only changes behavior
    // if a request's isInterState doesn't actually match its place of
    // supply. Falls back to the client's value only if the business state
    // isn't configured yet (nothing to compare against).
    const biz = await getBusinessSettings();
    const derivedIsInterState = deriveIsInterState(String(placeOfSupply), biz.state);
    const isInterState = derivedIsInterState !== null ? derivedIsInterState : Boolean(clientIsInterState);

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
    {
      const seenProductIds = new Set<string>();
      for (const item of items as { productId: string }[]) {
        if (!item.productId) continue; // unlinked custom items (e.g. "Delivery Charges") can repeat freely
        if (seenProductIds.has(item.productId)) {
          return NextResponse.json({ error: "Each product can only appear once per invoice — combine duplicate lines into a single quantity instead." }, { status: 400 });
        }
        seenProductIds.add(item.productId);
      }
    }
    for (const item of items as { productId?: string; name?: string }[]) {
      if (!item.productId && !String(item.name ?? "").trim()) {
        return NextResponse.json({ error: "Custom items must have a name" }, { status: 400 });
      }
    }

    // The client always resolves a real Customer row before submitting
    // (creating one inline via /api/customers if needed) — mirrors how
    // /api/purchase-bills requires an existing vendorId rather than
    // accepting inline vendor details. Deliberately not filtered by
    // deletedAt: a "just for this invoice" customer is soft-deleted the
    // moment it's created (so it never surfaces in the directory) but must
    // still be usable for the invoice being created right now.
    if (!customerId) {
      return NextResponse.json({ error: "Customer is required." }, { status: 400 });
    }
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Selected customer was not found." }, { status: 400 });
    }

    // Financial year (Apr-Mar), not calendar year — see getIndianFinancialYear.
    // Invoice.date always defaults to "now" at creation (not client-set), so
    // "now" is the correct date to derive this invoice's FY from. Rendered
    // as a "2026-27" label (not a bare year) so the printed number itself
    // shows which FY it belongs to.
    const currentYearLabel = formatFinancialYearLabel(getIndianFinancialYear(new Date()));

    // Fetch product details for each item (custom/unlinked items have no productId)
    const productIds = items.map((item: { productId?: string }) => item.productId).filter(Boolean);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Calculate totals
    let subtotal = 0;
    let totalGst = 0;

    const invoiceItems = items.map((item: {
      productId?: string;
      name?: string;
      quantity?: number;
      qty?: number;
      price: number;
      gstRate: number;
      hsn?: string;
      unit?: string;
      discountPercent?: number;
    }) => {
      const product = item.productId ? productMap.get(item.productId) : undefined;
      const quantity = parseFloat(String(item.quantity ?? item.qty ?? 1));
      const price = parseFloat(String(item.price));
      const gstRate = parseFloat(String(item.gstRate ?? product?.gstRate ?? 18));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      const { discountAmount, gstAmt: gstAmount, total: itemTotal, taxable: itemSubtotal } =
        lineBreakdown({ qty: quantity, price, gstRate, discountPercent });

      subtotal += itemSubtotal;
      totalGst += gstAmount;

      return {
        productId: item.productId || null,
        name: product?.name || (item.name ?? "").trim() || "Unknown Product",
        hsn: (item.hsn ?? product?.hsn ?? "").trim(),
        quantity,
        unit: product?.unit || item.unit || "Nos",
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

    const { roundOff, roundedTotal: total } = computeRoundOff(subtotal + cgst + sgst + igst);

    // Invoice-number generation (highest-existing-number-for-year + 1, or the
    // admin's one-time "next number" override from Settings if it's higher)
    // and the create both run inside one Serializable transaction, with a
    // retry on the write-conflict Postgres reports when two requests race
    // for the same number — without this, concurrent requests would hand
    // out duplicate invoice numbers instead of one of them safely retrying.
    const invoicePrefix = biz.invoiceNumberPrefix || deriveDefaultPrefix(biz.name);
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        const candidatesThisYear = await tx.invoice.findMany({
          where: { invoiceNumber: numberFormatDbFilter(biz.invoiceNumberFormat, invoicePrefix, currentYearLabel) },
          select: { invoiceNumber: true },
        });
        const { documentNumber: invoiceNumber, overrideUsed } = computeNextNumber(
          candidatesThisYear.map((c) => c.invoiceNumber),
          biz.invoiceNumberFormat,
          invoicePrefix,
          currentYearLabel,
          biz.nextInvoiceNumberOverride
        );
        if (overrideUsed) {
          await tx.businessSettings.update({ where: { id: "singleton" }, data: { nextInvoiceNumberOverride: null } });
        }

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
            roundOff,
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

        const stockedItems = (invoiceItems as { productId: string | null; quantity: number }[]).filter((item) => item.productId);
        const updatedProducts = await batchAdjustStock(
          tx,
          stockedItems.map((item) => ({
            productId: item.productId!,
            quantity: -item.quantity,
          })),
          { type: "sale", reference: inv.invoiceNumber, createdByUserId: user.id }
        );
        const warnings = updatedProducts
          .filter((p) => p.stock < 0)
          .map((p) => `${p.name} (stock: ${p.stock})`);

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
    if (error instanceof ProductNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create invoice" }, { status: 500 });
  }
}
