import { NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { getDismissedNotificationSummary } from "@/lib/notifications";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const includeBin = auth.session.user.role !== "manager";
    const summary = await getDismissedNotificationSummary({ includeBin, userId: auth.session.user.id });
    return NextResponse.json(summary);
  } catch (error) {
    console.error("GET /api/notifications/dismissed error:", error);
    return NextResponse.json({ error: "Failed to fetch dismissed notifications" }, { status: 500 });
  }
}
