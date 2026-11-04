import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/apiAuth";
import { revalidateTag } from "next/cache";
import { isStateBearingAction } from "@/lib/activityProtection";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const entry = await prisma.activityLog.findUnique({ where: { id }, select: { action: true } });
    if (!entry) return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
    // The app reads these rows back as state (which customers/vendors are in the Recycle Bin, who created
    // a product/brand/category/customer/vendor) — see src/lib/activityProtection.ts.
    if (isStateBearingAction(entry.action)) {
      return NextResponse.json(
        { error: "This entry can't be deleted — the app uses it to track Recycle Bin items and who created products, brands, categories, customers and vendors." },
        { status: 409 }
      );
    }
    await prisma.activityLog.delete({ where: { id } });
    revalidateTag("activity", { expire: 0 });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
    }
    console.error("DELETE /api/admin/activity/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete log entry" }, { status: 500 });
  }
}
