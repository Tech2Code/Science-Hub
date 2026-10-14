import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateRateListInput } from "@/lib/validation";
import { validateAndBuildRateListItems } from "@/lib/rateListForm";

const CONCURRENT_EDIT_MESSAGE = "This rate list was updated by someone else since you opened this page. Please refresh and try again.";

class ConcurrentEditError extends Error {}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    // No deletedAt filter (matches getInvoice()'s/the purchase-bill GET's behavior) — a bin
    // (soft-deleted) rate list's own detail page must still load so its admin-only "Reassign"
    // action stays reachable without going through the all-or-nothing bulk "Reassign & Delete" flow.
    const rateList = await prisma.rateList.findUnique({
      where: { id },
      include: {
        items: { orderBy: { serialNo: "asc" } },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!rateList) return NextResponse.json({ error: "Rate list not found" }, { status: 404 });
    return NextResponse.json(rateList);
  } catch (error) {
    console.error("GET /api/rate-lists/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch rate list" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const existing = await prisma.rateList.findUnique({ where: { id }, select: { deletedAt: true, updatedAt: true } });
    if (!existing) return NextResponse.json({ error: "Rate list not found" }, { status: 404 });
    if (existing.deletedAt) {
      return NextResponse.json({ error: "This rate list is in the bin — restore it before editing" }, { status: 400 });
    }

    const body = await request.json();
    const { title, note, items, expectedUpdatedAt } = body;

    // Optional optimistic-concurrency check (same pattern as PUT /api/customers/[id]): the edit
    // page sends the updatedAt it loaded, so a save can't silently overwrite someone else's edit.
    let expected: Date | null = null;
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== null) {
      expected = new Date(String(expectedUpdatedAt));
      if (isNaN(expected.getTime())) {
        return NextResponse.json({ error: "Invalid expectedUpdatedAt" }, { status: 400 });
      }
      if (expected.getTime() !== existing.updatedAt.getTime()) {
        return NextResponse.json({ error: CONCURRENT_EDIT_MESSAGE }, { status: 409 });
      }
    }

    const validationError = validateRateListInput({ title, note });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const itemsResult = validateAndBuildRateListItems(items);
    if ("error" in itemsResult) return NextResponse.json({ error: itemsResult.error }, { status: 400 });

    // No stock/ledger side effects to reverse, so delete-and-recreate items in one transaction is safe.
    let rateList;
    try {
      rateList = await prisma.$transaction(async (tx) => {
        // Re-check inside the transaction: a conditional update takes the row lock, so two
        // concurrent saves that both passed the pre-check above can't both win.
        if (expected) {
          const claimed = await tx.rateList.updateMany({
            where: { id, updatedAt: expected, deletedAt: null },
            data: { updatedAt: new Date() },
          });
          if (claimed.count === 0) throw new ConcurrentEditError();
        }
        await tx.rateListItem.deleteMany({ where: { rateListId: id } });
        return tx.rateList.update({
          where: { id },
          data: {
            title: (title as string).trim(),
            note: typeof note === "string" ? note.trim() || null : null,
            items: { create: itemsResult.items },
          },
          include: { items: { orderBy: { serialNo: "asc" } }, createdBy: { select: { id: true, name: true } } },
        });
      });
    } catch (err) {
      if (err instanceof ConcurrentEditError) {
        return NextResponse.json({ error: CONCURRENT_EDIT_MESSAGE }, { status: 409 });
      }
      throw err;
    }

    await logActivity(auth.session.user.id, "update_rate_list", `Updated rate list "${rateList.title}" | Items: ${itemsResult.items.length}`, id, "rate_list");
    revalidateTag("rate-lists", { expire: 0 });
    return NextResponse.json(rateList);
  } catch (error) {
    console.error("PUT /api/rate-lists/[id] error:", error);
    return NextResponse.json({ error: "Failed to update rate list" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const rateList = await prisma.rateList.findUnique({ where: { id }, select: { title: true, deletedAt: true } });
    if (!rateList) return NextResponse.json({ error: "Rate list not found" }, { status: 404 });
    if (rateList.deletedAt) return NextResponse.json({ message: "Already deleted" });

    await prisma.rateList.update({ where: { id }, data: { deletedAt: new Date() } });
    await logActivity(auth.session.user.id, "delete_rate_list", `Deleted rate list "${rateList.title}"`, id, "rate_list");
    revalidateTag("rate-lists", { expire: 0 });
    return NextResponse.json({ message: "Rate list deleted" });
  } catch (error) {
    console.error("DELETE /api/rate-lists/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete rate list" }, { status: 500 });
  }
}
