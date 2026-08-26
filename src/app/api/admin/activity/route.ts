import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity";
import { requireAdmin } from "@/lib/apiAuth";
import { parsePaginationParams, buildSearchWhere } from "@/lib/apiPagination";

// Entries tied to GST-numbered documents (invoices/purchase bills/credit
// notes) are exempt — those documents are themselves retained indefinitely
// (see the Bin's own GST exemption), so their audit trail (who created/
// edited/deleted/paid them) shouldn't silently disappear out from under
// them while the document itself is still around, possibly for years.
const PURGE_EXEMPT_ENTITY_TYPES = ["invoice", "purchase_bill", "return"];
const ACTIVITY_LOG_RETENTION_DAYS = 30;

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
      await prisma.activityLog.deleteMany({
        where: {
          createdAt: { lt: cutoff },
          // Explicit OR (rather than NOT: { entityType: { in: [...] } }) so rows with
          // a null entityType (logins, settings changes, etc.) are still purged —
          // SQL's NULL IN (...) is neither true nor false, which would otherwise
          // silently exclude every non-entity-scoped log row from ever being purged.
          OR: [
            { entityType: null },
            { entityType: { notIn: PURGE_EXEMPT_ENTITY_TYPES } },
          ],
        },
      });
    }

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
