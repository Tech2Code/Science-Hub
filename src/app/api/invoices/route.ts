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
import { checkCustomerCreditLimit, type CreditLimitCheck } from "@/lib/creditLimit";

// Thrown from inside the create transaction so the credit-limit check can be re-validated
// atomically alongside the invoice insert (see attemptCreate below) while still surfacing to the
// caller as a plain 422, the same shape as before it moved inside the transaction.
class CreditLimitExceededError extends Error {
  constructor(public check: CreditLimitCheck) {
    super("Credit limit exceeded");
  }
}

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
    const { items, notes, dueDate, isInterState: clientIsInterState, placeOfSupply, reverseCharge, transportCharge, transportChargeGstRate, idempotencyKey, overrideCreditLimit } = body;
    const { customerId } = body;

    if (!items || items.length === 0) {
      return NextResponse.json({ error: "At least one item is required" }, { status: 400 });
    }
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== "string" || idempotencyKey.length > 200)) {
      return NextResponse.json({ error: "Invalid idempotency key" }, { status: 400 });
    }
    // A retried/duplicated create submission of the same client-generated key is a no-op —
    // return the invoice that submission already created rather than creating a second one. But
    // the key is only globally unique in the DB, not scoped to a customer, so a match belonging to
    // a DIFFERENT customer must NOT be silently treated as "this create already happened" — that
    // would hand back an unrelated invoice as if it were the one just requested. Only a match for
    // the SAME customer is treated as a genuine replay (total isn't known yet at this point in the
    // request, so it's re-checked more precisely in the race-handling branch below).
    if (idempotencyKey) {
      const existing = await prisma.invoice.findUnique({
        where: { idempotencyKey },
        include: { customer: true, items: true },
      });
      if (existing) {
        if (existing.customerId !== customerId) {
          return NextResponse.json({ error: "This idempotency key was already used for a different invoice." }, { status: 409 });
        }
        return NextResponse.json({ ...existing, stockWarnings: [] }, { status: 200 });
      }
    }
    if (!placeOfSupply || !String(placeOfSupply).trim()) {
      return NextResponse.json({ error: "Place of supply is required" }, { status: 400 });
    }

    // Never trust the client's isInterState flag; derive it server-side (fall back to client's value only if business state isn't configured).
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
    for (const item of items as { productId?: string; name?: string; hsn?: string; unit?: string }[]) {
      if (!item.productId && !String(item.name ?? "").trim()) {
        return NextResponse.json({ error: "Custom items must have a name" }, { status: 400 });
      }
      if (!item.productId && String(item.name ?? "").trim().length < 2) {
        return NextResponse.json({ error: "Item name must be at least 2 characters." }, { status: 400 });
      }
      if (String(item.name ?? "").length > 200) {
        return NextResponse.json({ error: "Item name is too long (max 200 characters)." }, { status: 400 });
      }
      if (String(item.hsn ?? "").length > 50) {
        return NextResponse.json({ error: "Item HSN/SAC is too long (max 50 characters)." }, { status: 400 });
      }
      if (String(item.unit ?? "").length > 100) {
        return NextResponse.json({ error: "Item unit is too long (max 100 characters)." }, { status: 400 });
      }
    }
    if (typeof notes === "string" && notes.length > 2000) {
      return NextResponse.json({ error: "Notes is too long (max 2000 characters)." }, { status: 400 });
    }

    // Not filtered by deletedAt: a "just for this invoice" customer is soft-deleted on creation but must still be usable here.
    if (!customerId) {
      return NextResponse.json({ error: "Customer is required." }, { status: 400 });
    }
    const customer = await prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      return NextResponse.json({ error: "Selected customer was not found." }, { status: 400 });
    }

    // Indian FY (Apr-Mar), derived from "now" since Invoice.date always defaults to creation time.
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

    // Transport charge GST is kept separate from CGST/SGST/IGST (pure item-tax sum); amount is always recomputed server-side, never trusted from client.
    const transportChargeVal = parseFloat(String(transportCharge ?? 0)) || 0;
    const transportChargeGstRateVal = parseFloat(String(transportChargeGstRate ?? 0)) || 0;
    if (transportChargeVal < 0) {
      return NextResponse.json({ error: "Transport charge cannot be negative" }, { status: 400 });
    }
    if (transportChargeGstRateVal < 0) {
      return NextResponse.json({ error: "Transport charge GST rate cannot be negative" }, { status: 400 });
    }
    const transportChargeGstAmountVal = (transportChargeVal * transportChargeGstRateVal) / 100;

    const { roundOff, roundedTotal: total } = computeRoundOff(subtotal + cgst + sgst + igst + transportChargeVal + transportChargeGstAmountVal);

    // Number generation + create run in one Serializable transaction, retried on write-conflict, to prevent duplicate invoice numbers under concurrent requests.
    const invoicePrefix = biz.invoiceNumberPrefix || deriveDefaultPrefix(biz.name);
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        // A new invoice's balanceDue equals its total (paidAmount is always 0 at creation).
        // Soft-blocked unless the caller explicitly confirms via overrideCreditLimit — checked
        // inside this same Serializable transaction (not before it) so two concurrent invoices for
        // the same customer can't each read the same outstanding balance, both pass, and jointly
        // breach the limit with neither ever seeing the other's invoice.
        const creditCheck = await checkCustomerCreditLimit(tx, customerId, total);
        if (creditCheck?.exceeded && overrideCreditLimit !== true) {
          throw new CreditLimitExceededError(creditCheck);
        }

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
            transportCharge: transportChargeVal,
            transportChargeGstRate: transportChargeGstRateVal,
            transportChargeGstAmount: transportChargeGstAmountVal,
            paidAmount: 0,
            notes: notes || null,
            dueDate: dueDate ? new Date(dueDate) : null,
            isInterState: Boolean(isInterState),
            placeOfSupply: String(placeOfSupply).trim(),
            reverseCharge: Boolean(reverseCharge),
            idempotencyKey: idempotencyKey || null,
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

        return { invoice: inv, stockWarnings: warnings, creditCheck };
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
        // Two near-simultaneous requests carrying the same idempotency key can both pass the
        // pre-check above and race to insert — the loser hits the unique constraint here.
        const isDuplicateKey = idempotencyKey
          && error instanceof Prisma.PrismaClientKnownRequestError
          && error.code === "P2002"
          && Array.isArray((error.meta as { target?: unknown })?.target)
          && (error.meta as { target: string[] }).target.includes("idempotencyKey");
        if (isDuplicateKey) {
          const existing = await prisma.invoice.findUnique({
            where: { idempotencyKey },
            include: { customer: true, items: true },
          });
          if (existing) {
            if (existing.customerId !== customerId || existing.total !== total) {
              return NextResponse.json({ error: "This idempotency key was already used for a different invoice." }, { status: 409 });
            }
            return NextResponse.json({ ...existing, stockWarnings: [] }, { status: 200 });
          }
        }
        if (error instanceof CreditLimitExceededError) {
          return NextResponse.json({
            error: `This invoice would take ${customer.name}'s outstanding balance to ₹${error.check.projectedOutstanding.toFixed(2)}, over their ₹${error.check.creditLimit.toFixed(2)} credit limit.`,
            code: "CREDIT_LIMIT_EXCEEDED",
            creditLimitCheck: error.check,
          }, { status: 422 });
        }
        throw error;
      }
    }
    const { invoice, stockWarnings, creditCheck } = result!;

    const creditOverrideNote = creditCheck?.exceeded && overrideCreditLimit === true
      ? ` | Credit limit override: proceeded past ₹${creditCheck.creditLimit.toFixed(2)} limit (projected outstanding ₹${creditCheck.projectedOutstanding.toFixed(2)})`
      : "";
    await logActivity(user.id, "create_invoice", `Created invoice ${invoice.invoiceNumber} for ${invoice.customer.name} | Total: ₹${invoice.total.toFixed(2)} | Items: ${invoiceItems.length} | Tax: ${isInterState ? "IGST" : "CGST+SGST"}${creditOverrideNote}`, invoice.id, "invoice");
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
