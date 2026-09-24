import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";

// Admin-only: changes which user is recorded as a rate list's creator. Deliberately works
// regardless of bin (soft-deleted) state — see the matching invoice reassign route for the full
// reasoning (this closes the same "can't delete a user who created records" FK block for
// RateList.createdByUserId).
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
      const rateList = await tx.rateList.findUnique({ where: { id }, select: { title: true, createdByUserId: true } });
      if (!rateList) return { error: "Rate list not found", status: 404 } as const;
      if (rateList.createdByUserId === userId) {
        return { error: "Rate list is already assigned to this user", status: 400 } as const;
      }

      const previousUser = await tx.user.findUnique({ where: { id: rateList.createdByUserId }, select: { name: true } });

      const conflictCheck = await tx.rateList.updateMany({
        where: { id, createdByUserId: rateList.createdByUserId },
        data: { createdByUserId: userId },
      });
      if (conflictCheck.count === 0) {
        return { error: "This rate list was reassigned by someone else just now. Please try again.", status: 409 } as const;
      }

      const updated = await tx.rateList.findUniqueOrThrow({
        where: { id },
        include: { createdBy: { select: { id: true, name: true } } },
      });
      return { updated, title: rateList.title, previousUserName: previousUser?.name ?? "unknown" } as const;
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

    await logActivity(
      auth.session.user.id,
      "reassign_rate_list",
      `Reassigned rate list "${result.title}" from ${result.previousUserName} to ${targetUser.name}`,
      id,
      "rate_list"
    );
    revalidateTag("rate-lists", { expire: 0 });

    return NextResponse.json(result.updated);
  } catch (error) {
    console.error("PUT /api/rate-lists/[id]/reassign error:", error);
    return NextResponse.json({ error: "Failed to reassign rate list" }, { status: 500 });
  }
}
