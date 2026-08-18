import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { logActivity } from "@/lib/activity";
import { batchAdjustStock, ProductNotFoundError } from "@/lib/stockMovement";
import { isPurchaseBillBlobUrl } from "@/lib/blobStorage";
import { isFutureIstDate } from "@/lib/validation";
import { computeRoundOff } from "@/lib/roundOff";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { purchaseBillLineBreakdown } from "@/lib/purchaseBillForm";
import { getBusinessSettings } from "@/lib/db";
import { deriveIsInterState } from "@/lib/gstLocation";
import { computeNextNumber, numberFormatDbFilter, getIndianFinancialYear, formatFinancialYearLabel } from "@/lib/documentNumbering";
import { parsePageParams, monthYearToDateRange } from "@/lib/listQuery";
import { buildBillWhere, buildBillOrderBy, type PurchaseBillSort } from "@/lib/purchaseBillQuery";

const BILL_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true, state: true, updatedAt: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: {
        select: {
          id: true, name: true, unit: true,
          brand: { select: { name: true } },
          category: { select: { name: true } },
        },
      },
    },
  },
  payments: { orderBy: { date: "desc" as const } },
};

// Lighter than BILL_INCLUDE (used by the detail route) — the list page
// doesn't render payments or item/product/brand/category details, only
// what's needed to display a row; search now happens in the `where` clause
// server-side instead of needing those joins back in the response.
const BILL_LIST_INCLUDE = {
  vendor: { select: { id: true, name: true, company: true, updatedAt: true } },
  createdBy: { select: { id: true, name: true } },
};

export async function GET(req: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const vendorId = searchParams.get("vendorId");
    const search = searchParams.get("search") ?? undefined;
    const sort = (searchParams.get("sort") ?? undefined) as PurchaseBillSort | undefined;
    const dateRange = monthYearToDateRange(searchParams.get("month") ?? "", searchParams.get("year") ?? "");
    const { skip, take } = parsePageParams(searchParams);

    const where = buildBillWhere({ status, vendorId, search, dateRange });
    const [data, total] = await Promise.all([
      prisma.purchaseBill.findMany({ where, include: BILL_LIST_INCLUDE, orderBy: buildBillOrderBy(sort), skip, take }),
      prisma.purchaseBill.count({ where }),
    ]);
    return NextResponse.json({ data, total });
  } catch {
    return NextResponse.json({ error: "Failed to fetch purchase bills" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const userId = auth.session.user.id;

    const body = await req.json();
    const { vendorId, billDate, dueDate, discount, notes, category, items, payment, attachmentUrl, attachmentName, transportCharge, transportChargeGstRate } = body;

    if (!vendorId) return NextResponse.json({ error: "Vendor is required." }, { status: 400 });
    if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
    if (attachmentUrl && !isPurchaseBillBlobUrl(attachmentUrl)) {
      return NextResponse.json({ error: "Invalid attachment URL" }, { status: 400 });
    }

    // Deliberately not filtered by deletedAt: a "just for this bill" vendor
    // is soft-deleted the moment it's created (so it never surfaces in the
    // vendor directory) but must still be usable for the bill being created
    // right now — filtering it out here would make that flow impossible.
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) return NextResponse.json({ error: "Vendor not found" }, { status: 400 });

    if (billDate && isFutureIstDate(billDate)) {
      return NextResponse.json({ error: "Bill date cannot be in the future" }, { status: 400 });
    }

    if (dueDate) {
      const parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      }
      const parsedBillDate = new Date(billDate ?? Date.now());
      if (parsedDueDate < parsedBillDate) {
        return NextResponse.json({ error: "Due date cannot be before the bill date" }, { status: 400 });
      }
    }

    const effectiveBillDate = new Date(billDate ?? Date.now());
    let paymentDate: Date | undefined;
    if (payment?.date) {
      paymentDate = new Date(payment.date);
      if (isNaN(paymentDate.getTime())) {
        return NextResponse.json({ error: "Invalid payment date" }, { status: 400 });
      }
      if (paymentDate < effectiveBillDate) {
        return NextResponse.json({ error: "Payment date cannot be before the bill date" }, { status: 400 });
      }
      if (isFutureIstDate(payment.date)) {
        return NextResponse.json({ error: "Payment date cannot be in the future" }, { status: 400 });
      }
    }

    for (const item of items as { productId?: string; quantity: number; purchasePrice: number; discountPercent?: number; name?: string; hsn?: string; unit?: string }[]) {
      const quantity = parseFloat(String(item.quantity));
      const purchasePrice = parseFloat(String(item.purchasePrice));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      if (!(quantity > 0)) return NextResponse.json({ error: "Item quantity must be greater than 0" }, { status: 400 });
      if (!(purchasePrice >= 0)) return NextResponse.json({ error: "Item price cannot be negative" }, { status: 400 });
      if (Number.isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        return NextResponse.json({ error: "Item discount must be between 0 and 100%" }, { status: 400 });
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

    // Recompute every item's GST/total server-side from quantity × price × rate —
    // mirrors the invoices route, so a stale or tampered client-sent total/GST
    // can never get persisted as the bill's authoritative amount. Discount is
    // applied to the line's gross amount before GST, same as sales invoices:
    // taxable value = gross - discount, GST computed on that taxable value.
    const computedItems = (items as {
      productId?: string; name: string; quantity: number; hsn?: string;
      unit?: string; purchasePrice: number; gstRate?: number; discountPercent?: number;
    }[]).map((item) => {
      const quantity = parseFloat(String(item.quantity));
      const purchasePrice = parseFloat(String(item.purchasePrice));
      const gstRate = parseFloat(String(item.gstRate ?? 0));
      const discountPercent = parseFloat(String(item.discountPercent ?? 0));
      const { discountAmount, gstAmount, total, subtotal: itemSubtotal } =
        purchaseBillLineBreakdown(quantity, purchasePrice, gstRate, discountPercent);
      return { ...item, quantity, purchasePrice, gstRate, discountPercent, discountAmount, gstAmount, total, itemSubtotal, hsn: item.hsn ?? "" };
    });
    const subtotal = computedItems.reduce((s, i) => s + i.itemSubtotal, 0);
    const taxAmount = computedItems.reduce((s, i) => s + i.gstAmount, 0);
    const parsedDiscount = discount !== undefined && discount !== null && discount !== "" ? parseFloat(String(discount)) : 0;
    if (Number.isNaN(parsedDiscount) || parsedDiscount < 0) {
      return NextResponse.json({ error: "Discount cannot be negative" }, { status: 400 });
    }

    // A purchase's GST type is a fact of where the vendor is registered
    // relative to the business — not something the preparer picks — so it's
    // derived automatically from the vendor's own state, same reasoning
    // sales invoices already use via deriveIsInterState (just with the
    // vendor's state standing in for the invoice's placeOfSupply).
    const vendorState: string | null = vendor.state;
    const biz = await getBusinessSettings();
    const derivedIsInterState = deriveIsInterState(vendorState ?? "", biz.state);
    const isInterState = derivedIsInterState ?? false;
    const cgst = isInterState ? 0 : taxAmount / 2;
    const sgst = isInterState ? 0 : taxAmount / 2;
    const igst = isInterState ? taxAmount : 0;

    // Transport/freight charge — own line, own GST, kept out of the
    // CGST/SGST/IGST split, always server-recomputed rather than trusted.
    const transportChargeVal = parseFloat(String(transportCharge ?? 0)) || 0;
    const transportChargeGstRateVal = parseFloat(String(transportChargeGstRate ?? 0)) || 0;
    if (transportChargeVal < 0) {
      return NextResponse.json({ error: "Transport charge cannot be negative" }, { status: 400 });
    }
    if (transportChargeGstRateVal < 0) {
      return NextResponse.json({ error: "Transport charge GST rate cannot be negative" }, { status: 400 });
    }
    const transportChargeGstAmountVal = (transportChargeVal * transportChargeGstRateVal) / 100;

    const payAmt = payment?.amount ?? 0;
    const { roundOff, roundedTotal: billTotal } = computeRoundOff(subtotal + taxAmount - parsedDiscount + transportChargeVal + transportChargeGstAmountVal);
    if (billTotal < 0) return NextResponse.json({ error: "Discount cannot exceed the bill total" }, { status: 400 });
    const paidAmount = Math.min(payAmt, billTotal);
    const status = paidAmount >= billTotal && billTotal > 0 ? "paid" : paidAmount > 0 ? "partial" : "unpaid";
    // Financial year (Apr-Mar) of the bill's own date, not calendar year —
    // see getIndianFinancialYear. Uses billDate (not "now") since a bill can
    // be entered late, dated for an earlier period. Rendered as a "2026-27"
    // label (not a bare year) so the printed number shows which FY it's in.
    const yearLabel = formatFinancialYearLabel(getIndianFinancialYear(new Date(billDate ?? Date.now())));

    // Bill-number generation (highest-existing-number-for-year + 1, or the
    // admin's one-time "next number" override from Settings if it's higher)
    // and the create both run inside one Serializable transaction, with a
    // retry on the write-conflict Postgres reports when two requests race
    // for the same number.
    const billPrefix = biz.purchaseBillNumberPrefix || "PB";
    async function attemptCreate() {
      return prisma.$transaction(async (tx) => {
        const candidatesThisYear = await tx.purchaseBill.findMany({
          where: { billNumber: numberFormatDbFilter(biz.purchaseBillNumberFormat, billPrefix, yearLabel) },
          select: { billNumber: true },
        });
        const { documentNumber: billNumber, overrideUsed } = computeNextNumber(
          candidatesThisYear.map((c) => c.billNumber),
          biz.purchaseBillNumberFormat,
          billPrefix,
          yearLabel,
          biz.nextPurchaseBillNumberOverride
        );
        if (overrideUsed) {
          await tx.businessSettings.update({ where: { id: "singleton" }, data: { nextPurchaseBillNumberOverride: null } });
        }

        const created = await tx.purchaseBill.create({
          data: {
            billNumber,
            vendorId,
            billDate: billDate ? new Date(billDate) : new Date(),
            dueDate: dueDate ? new Date(dueDate) : null,
            subtotal,
            taxAmount,
            isInterState,
            placeOfSupply: vendorState,
            cgst,
            sgst,
            igst,
            discount: parsedDiscount,
            transportCharge: transportChargeVal,
            transportChargeGstRate: transportChargeGstRateVal,
            transportChargeGstAmount: transportChargeGstAmountVal,
            total: billTotal,
            roundOff,
            paidAmount,
            status,
            notes: notes || null,
            category: category || null,
            attachmentUrl: attachmentUrl || null,
            attachmentName: attachmentName || null,
            createdByUserId: userId,
            items: {
              create: computedItems.map((item) => ({
                productId: item.productId || null,
                name: item.name,
                hsn: item.hsn,
                quantity: item.quantity,
                unit: item.unit ?? "Nos",
                purchasePrice: item.purchasePrice,
                discountPercent: item.discountPercent,
                discountAmount: item.discountAmount,
                gstRate: item.gstRate,
                gstAmount: item.gstAmount,
                total: item.total,
              })),
            },
            ...(paidAmount > 0 && payment ? {
              payments: {
                create: {
                  amount: paidAmount,
                  method: payment.method ?? "Cash",
                  reference: payment.reference || null,
                  date: paymentDate ?? new Date(),
                  notes: payment.notes || null,
                },
              },
            } : {}),
          },
          include: BILL_INCLUDE,
        });

        // A purchase bill's whole point is restocking — without this, inventory
        // only ever drains via sales and never gets replenished.
        const stockedItems = computedItems.filter(item => item.productId);
        await batchAdjustStock(
          tx,
          stockedItems.map((item) => ({ productId: item.productId!, quantity: item.quantity })),
          { type: "purchase", reference: created.billNumber, purchaseBillId: created.id, createdByUserId: userId }
        );

        return created;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000, maxWait: 10000 });
    }

    const maxAttempts = 5;
    let bill: Awaited<ReturnType<typeof attemptCreate>> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        bill = await attemptCreate();
        break;
      } catch (error) {
        const isWriteConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
        if (isWriteConflict && attempt < maxAttempts) continue;
        throw error;
      }
    }
    if (!bill) throw new Error("Failed to create purchase bill after retries");

    await logActivity(userId, "create_purchase_bill", `Created purchase bill ${bill.billNumber} from ${bill.vendor.name} — ₹${billTotal}`, bill.id, "purchase_bill");
    revalidateTag("purchase-bills", { expire: 0 });
    revalidateTag("products", { expire: 0 });
    revalidateTag("reports", { expire: 0 });
    return NextResponse.json(bill, { status: 201 });
  } catch (err) {
    console.error(err);
    if (err instanceof ProductNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create purchase bill" }, { status: 500 });
  }
}
