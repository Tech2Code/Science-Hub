import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/apiAuth";
import { NOTIFICATION_CATEGORY_KEYS, type NotificationCategoryKey } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { category, entityId } = body as { category?: string; entityId?: string };
    if (!category || !NOTIFICATION_CATEGORY_KEYS.includes(category as NotificationCategoryKey)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!entityId || typeof entityId !== "string" || entityId.length > 200) {
      return NextResponse.json({ error: "Invalid entityId" }, { status: 400 });
    }

    // Upsert: re-dismissing an already-dismissed (but not yet expired) item just refreshes the timestamp.
    await prisma.notificationDismissal.upsert({
      where: { userId_category_entityId: { userId: auth.session.user.id, category, entityId } },
      create: { userId: auth.session.user.id, category, entityId },
      update: { dismissedAt: new Date() },
    });

    revalidateTag("notifications", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/notifications/dismiss error:", error);
    return NextResponse.json({ error: "Failed to dismiss notification" }, { status: 500 });
  }
}

// Undo — removes a dismissal so the item resurfaces immediately, without waiting for the 24h expiry.
// Identifies its target via the URL's query string, not a DELETE body — some infrastructure
// (proxies/CDNs) silently drops request bodies on DELETE, and every other delete route in this app
// addresses its target in the URL rather than a body.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const entityId = searchParams.get("entityId");
    if (!category || !NOTIFICATION_CATEGORY_KEYS.includes(category as NotificationCategoryKey)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    if (!entityId || entityId.length > 200) {
      return NextResponse.json({ error: "Invalid entityId" }, { status: 400 });
    }

    await prisma.notificationDismissal.deleteMany({
      where: { userId: auth.session.user.id, category, entityId },
    });

    revalidateTag("notifications", { expire: 0 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/notifications/dismiss error:", error);
    return NextResponse.json({ error: "Failed to undo dismissal" }, { status: 500 });
  }
}
