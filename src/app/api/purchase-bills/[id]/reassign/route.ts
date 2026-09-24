import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";

// Admin-only: changes which user is recorded as a purchase bill's creator. Deliberately works
// regardless of status (paid/unpaid/cancelled) or bin (soft-deleted) state — see the matching
// invoice reassign route for the full reasoning.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const { userId } = body as { userId?: string };
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
    if (!targetUser) return NextResponse.json({ error: "Target user not found" }, { status: 400 });
    // Managers are read-only and shouldn't become a document's recorded creator — the client
    // already excludes them from the picker, but that's a UI convenience, not a security boundary.
    if (targetUser.role === "manager") {
      return NextResponse.json({ error: "Cannot assign a manager as the document creator" }, { status: 400 });
    }

    // Read-then-conditionally-write inside one transaction — see the matching invoice reassign
    // route for the full reasoning (closes a stale-activity-log-message race).
    const result = await prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.findUnique({ where: { id }, select: { billNumber: true, createdByUserId: true } });
      if (!bill) return { error: "Bill not found", status: 404 } as const;
      if (bill.createdByUserId === userId) {
        return { error: "Bill is already assigned to this user", status: 400 } as const;
      }

      const previousUser = await tx.user.findUnique({ where: { id: bill.createdByUserId }, select: { name: true } });

      const conflictCheck = await tx.purchaseBill.updateMany({
        where: { id, createdByUserId: bill.createdByUserId },
        data: { createdByUserId: userId },
      });
      if (conflictCheck.count === 0) {
        return { error: "This bill was reassigned by someone else just now. Please try again.", status: 409 } as const;
      }

      const updated = await tx.purchaseBill.findUniqueOrThrow({
        where: { id },
        include: { createdBy: { select: { id: true, name: true } } },
      });
      return { updated, billNumber: bill.billNumber, previousUserName: previousUser?.name ?? "unknown" } as const;
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

    await logActivity(
      auth.session.user.id,
      "reassign_purchase_bill",
      `Reassigned purchase bill "${result.billNumber}" from ${result.previousUserName} to ${targetUser.name}`,
      id,
      "purchase_bill"
    );
    revalidateTag("purchase-bills", { expire: 0 });

    return NextResponse.json(result.updated);
  } catch (error) {
    console.error("PUT /api/purchase-bills/[id]/reassign error:", error);
    return NextResponse.json({ error: "Failed to reassign bill" }, { status: 500 });
  }
}
