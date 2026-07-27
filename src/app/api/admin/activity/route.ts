import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";
import { parsePaginationParams, buildSearchWhere } from "@/lib/apiPagination";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;
    const pagination = parsePaginationParams(searchParams);
    if (!pagination) return NextResponse.json({ error: "Invalid limit or offset" }, { status: 400 });
    const { limit, offset } = pagination;

    const where = {
      ...(userId ? { userId } : {}),
      ...buildSearchWhere(searchParams.get("search") ?? undefined, ["details", "user.name", "user.email"]),
    };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true, role: true } } },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.activityLog.count({ where }),
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
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { count } = await prisma.activityLog.deleteMany({});
    // Logged after the clear (not before) — a pre-clear log entry would just
    // get wiped out by the same deleteMany, leaving no record it happened.
    await logActivity(auth.session.user.id, "clear_activity_log", `Cleared entire activity log (${count} entr${count === 1 ? "y" : "ies"} removed)`);
    return NextResponse.json({ deleted: count });
  } catch (error) {
    console.error("DELETE /api/admin/activity error:", error);
    return NextResponse.json({ error: "Failed to clear activity log" }, { status: 500 });
  }
}
