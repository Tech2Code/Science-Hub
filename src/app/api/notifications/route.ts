import { NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/apiAuth";
import { getNotificationSummary, filterNotificationSummary } from "@/lib/notifications";

export async function GET() {
  try {
    // Managers are read-only and do not use operational alerts (low stock, overdue, bin, etc.).
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const summary = await getNotificationSummary({ includeBin: true, userId: auth.session.user.id });
    return NextResponse.json(filterNotificationSummary(summary, auth.session.user));
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
