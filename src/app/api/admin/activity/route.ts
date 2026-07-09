import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;
    const limit  = Math.min(parseInt(searchParams.get("limit") || "100"), 500);
    const offset = parseInt(searchParams.get("offset") || "0");

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where: userId ? { userId } : undefined,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where: userId ? { userId } : undefined }),
    ]);

    return NextResponse.json({ logs, total });
  } catch (error) {
    console.error("GET /api/admin/activity error:", error);
    return NextResponse.json({ error: "Failed to fetch activity" }, { status: 500 });
  }
}

// Delete the entire activity log
export async function DELETE() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (session.user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { count } = await prisma.activityLog.deleteMany({});
    // Logged after the clear (not before) — a pre-clear log entry would just
    // get wiped out by the same deleteMany, leaving no record it happened.
    await logActivity(session.user.id, "clear_activity_log", `Cleared entire activity log (${count} entr${count === 1 ? "y" : "ies"} removed)`);
    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("DELETE /api/admin/activity error:", error);
    return NextResponse.json({ error: "Failed to clear activity log" }, { status: 500 });
  }
}
