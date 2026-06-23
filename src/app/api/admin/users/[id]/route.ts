import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  _count: { select: { invoices: true } },
} as const;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { error: "Unauthorized", status: 401 } as const;
  if (session.user.role !== "admin") return { error: "Forbidden", status: 403 } as const;
  return { session };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: USER_SELECT,
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error("GET /api/admin/users/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const isAdmin = session.user.role === "admin";
    const isSelf = session.user.id === id;

    // Non-admins can only edit themselves
    if (!isAdmin && !isSelf) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, role, newPassword, currentPassword } = body as {
      name?: string;
      email?: string;
      role?: string;
      newPassword?: string;
      currentPassword?: string;
    };

    // Only admins can change roles
    if (role !== undefined && !isAdmin) {
      return NextResponse.json(
        { error: "Only admins can change roles" },
        { status: 403 }
      );
    }

    if (role !== undefined && role !== "admin" && role !== "staff") {
      return NextResponse.json(
        { error: 'role must be "admin" or "staff"' },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
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

      // If admin is editing another user, skip current-password check.
      // If editing own account (or non-admin editing self), require currentPassword.
      if (isSelf) {
        if (!currentPassword) {
          return NextResponse.json(
            { error: "currentPassword is required when changing your own password" },
            { status: 400 }
          );
        }
        const valid = await bcrypt.compare(currentPassword, targetUser.password);
        if (!valid) {
          return NextResponse.json(
            { error: "Current password is incorrect" },
            { status: 400 }
          );
        }
      }

      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // Email uniqueness check (against other users)
    if (email !== undefined && email !== targetUser.email) {
      const conflict = await prisma.user.findUnique({ where: { email } });
      if (conflict) {
        return NextResponse.json(
          { error: "A user with that email already exists" },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(role !== undefined && { role }),
        ...(hashedPassword !== undefined && { password: hashedPassword }),
      },
      select: USER_SELECT,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("PUT /api/admin/users/[id] error:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { session } = auth;
    const { id } = await params;

    // Cannot delete own account
    if (session.user.id === id) {
      return NextResponse.json(
        { error: "You cannot delete your own account" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent deletion if it would leave zero admins
    if (targetUser.role === "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return NextResponse.json(
          { error: "Cannot delete the last admin account" },
          { status: 400 }
        );
      }
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    console.error("DELETE /api/admin/users/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
