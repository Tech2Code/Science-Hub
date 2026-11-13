import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWriteAccess } from "@/lib/apiAuth";
import { getAllActiveNotificationIds, canSeeNotificationCategory, type NotificationCategoryKey } from "@/lib/notifications";

export async function POST() {
  try {
    const auth = await requireWriteAccess();
    if (!auth.ok) return auth.response;
    const userId = auth.session.user.id;

    const active = await getAllActiveNotificationIds(userId, true);
    const data = (Object.entries(active) as [NotificationCategoryKey, string[]][])
      .filter(([category]) => canSeeNotificationCategory(auth.session.user, category))
      .flatMap(([category, ids]) => ids.map((entityId) => ({ userId, category, entityId })));

    if (data.length > 0) {
      // An item dismissed > 24h ago (expired, so it's active again) still has its old row until
      // the 7-day purge — `skipDuplicates` alone would skip it WITHOUT refreshing dismissedAt, so
      // "Clear all" left exactly those resurfaced items visible. Refresh existing rows first.
      const byCategory = new Map<string, string[]>();
      for (const d of data) byCategory.set(d.category, [...(byCategory.get(d.category) ?? []), d.entityId]);
      await prisma.$transaction([
        prisma.notificationDismissal.updateMany({
          where: { userId, OR: [...byCategory].map(([category, ids]) => ({ category, entityId: { in: ids } })) },
          data: { dismissedAt: new Date() },
        }),
        prisma.notificationDismissal.createMany({ data, skipDuplicates: true }),
      ]);
    }

    revalidateTag("notifications", { expire: 0 });
    return NextResponse.json({ ok: true, cleared: data.length });
  } catch (error) {
    console.error("POST /api/notifications/clear-all error:", error);
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}
