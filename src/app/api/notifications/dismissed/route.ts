import { NextResponse } from "next/server";
import { requireWriteAccess } from "@/lib/apiAuth";
import { getDismissedNotificationSummary, filterNotificationSummary } from "@/lib/notifications";

export async function GET() {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;

    const summary = await getDismissedNotificationSummary({ includeBin: true, userId: auth.session.user.id });
    return NextResponse.json(filterNotificationSummary(summary, auth.session.user));
  } catch (error) {
    console.error("GET /api/notifications/dismissed error:", error);
    return NextResponse.json({ error: "Failed to fetch dismissed notifications" }, { status: 500 });
  }
}
