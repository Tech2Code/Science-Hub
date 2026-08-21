import { prisma } from "./prisma";

export async function logActivity(
  userId: string,
  action: string,
  details: string,
  entityId?: string,
  entityType?: string
) {
  try {
    await prisma.activityLog.create({
      data: { userId, action, details, entityId: entityId ?? null, entityType: entityType ?? null },
    });
  } catch (err) {
    // Never let logging failure break the main operation, but still trace it so it doesn't go unnoticed.
    console.error("logActivity failed:", err);
  }
}
