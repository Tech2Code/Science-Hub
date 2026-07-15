import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/apiAuth";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { id } = await params;
    await prisma.activityLog.delete({ where: { id } });
    return NextResponse.json({ message: "Deleted" });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Log entry not found" }, { status: 404 });
    }
    console.error("DELETE /api/admin/activity/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete log entry" }, { status: 500 });
  }
}
