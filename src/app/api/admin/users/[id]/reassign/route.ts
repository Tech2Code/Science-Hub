import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";

// Admin-only bulk reassign: moves every Invoice/PurchaseBill/RateList a user has created (across
// every status, including bin/soft-deleted rows — DELETE /api/admin/users/[id]'s own block counts
// those too) onto another user in one step. Exists specifically to clear the "cannot delete this
// user, they created N documents" block without having to open each document individually — see
// the per-document PUT .../reassign routes for the single-document equivalent.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { targetUserId } = body as { targetUserId?: string };
    if (!targetUserId || typeof targetUserId !== "string") {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }
    if (targetUserId === id) {
      return NextResponse.json({ error: "Choose a different user to reassign to" }, { status: 400 });
    }

    const [sourceUser, targetUser] = await Promise.all([
      prisma.user.findUnique({ where: { id }, select: { name: true } }),
      prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, name: true, role: true } }),
    ]);
    if (!sourceUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!targetUser) return NextResponse.json({ error: "Target user not found" }, { status: 400 });
    // Managers are read-only and shouldn't become a document's recorded creator — the client
    // already excludes them from the picker, but that's a UI convenience, not a security boundary.
    if (targetUser.role === "manager") {
      return NextResponse.json({ error: "Cannot reassign documents to a manager" }, { status: 400 });
    }

    const [invoiceResult, purchaseBillResult, rateListResult] = await prisma.$transaction([
      prisma.invoice.updateMany({ where: { userId: id }, data: { userId: targetUserId } }),
      prisma.purchaseBill.updateMany({ where: { createdByUserId: id }, data: { createdByUserId: targetUserId } }),
      prisma.rateList.updateMany({ where: { createdByUserId: id }, data: { createdByUserId: targetUserId } }),
    ]);

    const invoiceCount = invoiceResult.count;
    const purchaseBillCount = purchaseBillResult.count;
    const rateListCount = rateListResult.count;

    await logActivity(
      auth.session.user.id,
      "reassign_user_documents",
      `Reassigned ${invoiceCount} invoice(s), ${purchaseBillCount} purchase bill(s), ${rateListCount} rate list(s) from "${sourceUser.name}" to "${targetUser.name}"`,
      id,
      "user"
    );
    if (invoiceCount > 0) revalidateTag("invoices", { expire: 0 });
    if (purchaseBillCount > 0) revalidateTag("purchase-bills", { expire: 0 });
    if (rateListCount > 0) revalidateTag("rate-lists", { expire: 0 });

    return NextResponse.json({ invoiceCount, purchaseBillCount, rateListCount, targetUser });
  } catch (error) {
    console.error("POST /api/admin/users/[id]/reassign error:", error);
    return NextResponse.json({ error: "Failed to reassign documents" }, { status: 500 });
  }
}
