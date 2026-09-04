import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { getAllActiveNotificationIds, type NotificationCategoryKey } from "@/lib/notifications";

export async function POST() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const userId = auth.session.user.id;
    const includeBin = auth.session.user.role !== "manager";

    const active = await getAllActiveNotificationIds(userId, includeBin);
    const data = (Object.entries(active) as [NotificationCategoryKey, string[]][])
      .flatMap(([category, ids]) => ids.map((entityId) => ({ userId, category, entityId })));

    if (data.length > 0) {
      await prisma.notificationDismissal.createMany({ data, skipDuplicates: true });
    }

    return NextResponse.json({ ok: true, cleared: data.length });
  } catch (error) {
    console.error("POST /api/notifications/clear-all error:", error);
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}
