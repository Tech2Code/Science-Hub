import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";
import { parsePaginationParams, buildSearchWhere } from "@/lib/apiPagination";
import { ACTIVITY_LOG_RETENTION_DAYS, STATE_BEARING_ACTIONS, buildActivityPurgeWhere, buildActivityClearWhere } from "@/lib/activityProtection";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;
    const pagination = parsePaginationParams(searchParams);
    if (!pagination) return NextResponse.json({ error: "Invalid limit or offset" }, { status: 400 });
    const { limit, offset } = pagination;

    // Lazy purge (mirrors the Bin's own 30-day auto-purge — runs opportunistically
    // whenever this admin-only page is loaded, no cron/scheduler needed): silently
    // drop activity log rows older than the retention window, except entries tied
    // to a document type that's itself retained indefinitely. Restricted to the
    // page's first load (offset 0) — this route is re-fetched on every page-turn and
    // search keystroke, and a DELETE on every one of those requests would (a) add
    // an unnecessary write to a read-heavy list endpoint, and (b) risk rows vanishing
    // out from under an in-progress pagination session, shifting the skip window.
    if (offset === 0) {
      const cutoff = new Date(Date.now() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      // buildActivityPurgeWhere() keeps GST-document rows (retained as long as the documents are) and the
      // state-bearing rows the app reads back (Recycle-Bin markers, "Created by") — see activityProtection.ts.
      await prisma.activityLog.deleteMany({ where: buildActivityPurgeWhere(cutoff) });
    }

    const where = {
      ...(userId ? { userId } : {}),
      ...buildSearchWhere(searchParams.get("search") ?? undefined, ["details", "action", "user.name", "user.email"]),
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

    // State-bearing rows (Recycle-Bin markers, "Created by") are kept — deleting them would make binned
    // customers/vendors disappear from the Bin and blank every "Created by" column.
    const { count } = await prisma.activityLog.deleteMany({ where: buildActivityClearWhere() });
    const kept = await prisma.activityLog.count({ where: { action: { in: [...STATE_BEARING_ACTIONS] } } });
    // Logged after the clear (not before) — a pre-clear log entry would just
    // get wiped out by the same deleteMany, leaving no record it happened.
    await logActivity(auth.session.user.id, "clear_activity_log", `Cleared activity log (${count} entr${count === 1 ? "y" : "ies"} removed${kept > 0 ? `, ${kept} protected entr${kept === 1 ? "y" : "ies"} kept` : ""})`);
    return NextResponse.json({ deleted: count, kept });
  } catch (error) {
    console.error("DELETE /api/admin/activity error:", error);
    return NextResponse.json({ error: "Failed to clear activity log" }, { status: 500 });
  }
}
