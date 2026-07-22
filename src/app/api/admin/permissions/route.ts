import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/apiAuth";
import { prisma } from "@/lib/prisma";
import { PROTECTED_SECTIONS, ProtectedSection } from "@/lib/sections";

// GET — list all grantable users with their section permissions
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const users = await prisma.user.findMany({
      where: { role: { not: "admin" } },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        sectionPermissions: { select: { section: true, enabled: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("GET /api/admin/permissions error:", error);
    return NextResponse.json(
      { error: "Failed to load permissions" },
      { status: 500 }
    );
  }
}

// POST — toggle a section permission for a user
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { userId, section, enabled } = body as Record<string, unknown>;

  // Validate required fields and types
  if (typeof userId !== "string" || typeof section !== "string" || typeof enabled !== "boolean") {
    return NextResponse.json(
      { error: "Invalid request: userId (string), section (string), and enabled (boolean) are required" },
      { status: 400 }
    );
  }

  // Validate userId is non-empty
  if (!userId.trim()) {
    return NextResponse.json(
      { error: "Invalid userId" },
      { status: 400 }
    );
  }

  // Validate section identifier
  if (!PROTECTED_SECTIONS.includes(section as ProtectedSection)) {
    return NextResponse.json(
      { error: "Invalid section identifier" },
      { status: 400 }
    );
  }

  try {
    // Validate target user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Reject if target user is admin
    if (targetUser.role === "admin") {
      return NextResponse.json(
        { error: "Cannot modify permissions for admin users" },
        { status: 403 }
      );
    }

    // Upsert the section permission
    const permission = await prisma.sectionPermission.upsert({
      where: { userId_section: { userId, section } },
      create: { userId, section, enabled },
      update: { enabled },
    });

    return NextResponse.json({ ok: true, permission });
  } catch (error) {
    console.error("POST /api/admin/permissions error:", error);
    return NextResponse.json(
      { error: "Failed to update permission" },
      { status: 500 }
    );
  }
}
