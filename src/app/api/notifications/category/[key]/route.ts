import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { getNotificationCategoryItems, NOTIFICATION_CATEGORY_KEYS, type NotificationCategoryKey } from "@/lib/notifications";

// Powers the notification popover's per-section "Show all" expand — the full (uncapped-to-5)
// active item list for one category, so seeing everything doesn't require leaving the dropdown.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { key } = await params;
    if (!NOTIFICATION_CATEGORY_KEYS.includes(key as NotificationCategoryKey)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    // Bin access mirrors requireWriteAccess()'s manager restriction (see getNotificationSummary's
    // own includeBin handling) — a manager has no Bin page to expand into.
    if (key === "binExpiring" && auth.session.user.role === "manager") {
      return NextResponse.json({ items: [] });
    }

    const items = await getNotificationCategoryItems(auth.session.user.id, key as NotificationCategoryKey);
    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/notifications/category/[key] error:", error);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}
