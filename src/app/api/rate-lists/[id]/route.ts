import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireSession, requireWriteAccess } from "@/lib/apiAuth";
import { validateRateListInput } from "@/lib/validation";
import { validateAndBuildRateListItems } from "@/lib/rateListForm";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const rateList = await prisma.rateList.findFirst({
      where: { id, deletedAt: null },
      include: {
        items: { orderBy: { serialNo: "asc" } },
        createdBy: { select: { name: true } },
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
    const existing = await prisma.rateList.findUnique({ where: { id }, select: { deletedAt: true } });
    if (!existing) return NextResponse.json({ error: "Rate list not found" }, { status: 404 });
    if (existing.deletedAt) {
      return NextResponse.json({ error: "This rate list is in the bin — restore it before editing" }, { status: 400 });
    }

    const body = await request.json();
    const { title, note, items } = body;

    const validationError = validateRateListInput({ title, note });
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const itemsResult = validateAndBuildRateListItems(items);
    if ("error" in itemsResult) return NextResponse.json({ error: itemsResult.error }, { status: 400 });

    // No stock/ledger side effects to reverse, so delete-and-recreate items in one transaction is safe.
    const rateList = await prisma.$transaction(async (tx) => {
      await tx.rateListItem.deleteMany({ where: { rateListId: id } });
      return tx.rateList.update({
        where: { id },
        data: {
          title: (title as string).trim(),
          note: typeof note === "string" ? note.trim() || null : null,
          items: { create: itemsResult.items },
        },
        include: { items: { orderBy: { serialNo: "asc" } }, createdBy: { select: { name: true } } },
      });
    });

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
