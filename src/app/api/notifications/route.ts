import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { getNotificationSummary } from "@/lib/notifications";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    // Managers have no Bin access (see requireWriteAccess) — omit that category for them rather
    // than surfacing a count they can't click through to.
    const includeBin = auth.session.user.role !== "manager";
    const summary = await getNotificationSummary({ includeBin, userId: auth.session.user.id });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
