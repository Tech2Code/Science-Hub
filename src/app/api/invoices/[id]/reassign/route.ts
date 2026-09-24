import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { revalidateTag } from "next/cache";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";

// Admin-only: changes which user is recorded as an invoice's creator. Deliberately works
// regardless of the invoice's status (paid/unpaid) or bin (soft-deleted) state — this only
// corrects attribution, it doesn't touch any GST/financial data — so it can also be used to
// clear the FK block that stops deleting a user who has created invoices (see
// DELETE /api/admin/users/[id]).
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

    // Read-then-conditionally-write inside one transaction: the update's own `where` re-checks the
    // owner it just read, so a concurrent reassign of the same invoice can't leave this request's
    // activity-log entry describing a stale "from X" that no longer matches what actually happened.
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findUnique({ where: { id }, select: { invoiceNumber: true, userId: true } });
      if (!invoice) return { error: "Invoice not found", status: 404 } as const;
      if (invoice.userId === userId) {
        return { error: "Invoice is already assigned to this user", status: 400 } as const;
      }

      const previousUser = await tx.user.findUnique({ where: { id: invoice.userId }, select: { name: true } });

      const conflictCheck = await tx.invoice.updateMany({ where: { id, userId: invoice.userId }, data: { userId } });
      if (conflictCheck.count === 0) {
        return { error: "This invoice was reassigned by someone else just now. Please try again.", status: 409 } as const;
      }

      const updated = await tx.invoice.findUniqueOrThrow({
        where: { id },
        include: { createdBy: { select: { id: true, name: true } } },
      });
      return { updated, invoiceNumber: invoice.invoiceNumber, previousUserName: previousUser?.name ?? "unknown" } as const;
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

    await logActivity(
      auth.session.user.id,
      "reassign_invoice",
      `Reassigned invoice "${result.invoiceNumber}" from ${result.previousUserName} to ${targetUser.name}`,
      id,
      "invoice"
    );
    revalidateTag("invoices", { expire: 0 });

    return NextResponse.json(result.updated);
  } catch (error) {
    console.error("PUT /api/invoices/[id]/reassign error:", error);
    return NextResponse.json({ error: "Failed to reassign invoice" }, { status: 500 });
  }
}
