import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  _count: { select: { invoices: true } },
} as const;

async function resolveSessionUser(session: Awaited<ReturnType<typeof getServerSession>>) {
  if (!session?.user) return null;
  // Prefer id lookup; fall back to email for sessions created before token.id was wired up
  if (session.user.id) {
    return prisma.user.findUnique({ where: { id: session.user.id } });
  }
  if (session.user.email) {
    return prisma.user.findUnique({ where: { email: session.user.email } });
  }
  return null;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await resolveSessionUser(session);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const result = await prisma.user.findUnique({
      where: { id: user.id },
      select: USER_SELECT,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/profile error:", error);
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { name, email, currentPassword, newPassword } = body as {
      name?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    };

    const currentUser = await resolveSessionUser(session);

    if (!currentUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Email uniqueness check (against other users)
    if (email !== undefined && email !== currentUser.email) {
      const conflict = await prisma.user.findUnique({ where: { email } });
      if (conflict) {
        return NextResponse.json(
          { error: "A user with that email already exists" },
          { status: 409 }
        );
      }
    }

    // Password change logic
    let hashedPassword: string | undefined;
    if (newPassword !== undefined) {
      if (newPassword.length < 6) {
        return NextResponse.json(
          { error: "New password must be at least 6 characters" },
          { status: 400 }
        );
      }

      if (!currentPassword) {
        return NextResponse.json(
          { error: "currentPassword is required when changing your password" },
          { status: 400 }
        );
      }

      const valid = await bcrypt.compare(currentPassword, currentUser.password);
      if (!valid) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(hashedPassword !== undefined && { password: hashedPassword }),
      },
      select: USER_SELECT,
    });

    if (hashedPassword !== undefined) {
      await logActivity(currentUser.id, "change_password", `Changed own password`, currentUser.id, "user");
    } else {
      await logActivity(currentUser.id, "update_profile", `Updated own profile | Name: ${updated.name} | Email: ${updated.email}`, currentUser.id, "user");
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/admin/profile error:", error);
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}
