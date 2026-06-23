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
  } catch {
    // Never let logging failure break the main operation
  }
}
