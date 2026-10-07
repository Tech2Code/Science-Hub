import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";
import { validateUserInput } from "@/lib/validation";
import { requireAdmin, requireSession } from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";
import { revalidateTag } from "next/cache";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  _count: { select: { invoices: true } },
} as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

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
    const auth = await requireSession();
    if (!auth.ok) return auth.response;
    const { session } = auth;

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

    const shapeErr = validateUserInput({ name, role });
    if (shapeErr) return NextResponse.json({ error: shapeErr }, { status: 400 });

    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Password change logic
    let hashedPassword: string | undefined;
    if (newPassword !== undefined) {
      const pwErr = validateUserInput({ password: newPassword }, { passwordLabel: "New password" });
      if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

      // If admin is editing another user, skip current-password check.
      // If editing own account (or non-admin editing self), require currentPassword.
      if (isSelf) {
        // A session/cookie thief who doesn't know the real password could otherwise brute-force
        // currentPassword here with no login-page throttle to stop them.
        const limit = rateLimit(`profile-password:${session.user.id}`, 10, 15 * 60 * 1000);
        if (!limit.allowed) {
          return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
        }
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

      hashedPassword = await bcrypt.hash(newPassword, 12);
    }

    // Email uniqueness check (against other users) — normalized the same
    // way login does, so case-variant duplicates can't be created here.
    const normalizedEmail = email !== undefined ? email.trim().toLowerCase() : undefined;
    if (normalizedEmail !== undefined) {
      const emailErr = validateUserInput({ email: normalizedEmail });
      if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
    }
    const emailChanged = normalizedEmail !== undefined && normalizedEmail !== targetUser.email;
    if (emailChanged) {
      const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (conflict) {
        return NextResponse.json(
          { error: "A user with that email already exists" },
          { status: 409 }
        );
      }
      // Changing your OWN login email is an account-takeover vector for a session thief —
      // require the current password, same as a password change. (An admin editing another
      // user's email doesn't need that user's password.)
      if (isSelf && hashedPassword === undefined) {
        const limit = rateLimit(`profile-password:${session.user.id}`, 10, 15 * 60 * 1000);
        if (!limit.allowed) {
          return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
        }
        if (!currentPassword) {
          return NextResponse.json({ error: "Current password is required to change your email" }, { status: 400 });
        }
        const valid = await bcrypt.compare(currentPassword, targetUser.password);
        if (!valid) {
          return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
        }
      }
    }

    const roleChanged = role !== undefined && role !== targetUser.role;
    // Demoting the only remaining admin would lock everyone out of Settings/Admin permanently.
    if (roleChanged && targetUser.role === "admin" && role !== "admin") {
      const adminCount = await prisma.user.count({ where: { role: "admin" } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Can't remove the last admin" }, { status: 400 });
      }
    }

    // A role/email/password change invalidates the user's existing JWTs (forces re-login),
    // so e.g. a demoted admin loses admin access immediately rather than at token expiry.
    const bumpTokenVersion = hashedPassword !== undefined || roleChanged || emailChanged;

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(role !== undefined && { role }),
        ...(hashedPassword !== undefined && { password: hashedPassword }),
        ...(bumpTokenVersion && { tokenVersion: { increment: 1 } }),
      },
      select: USER_SELECT,
    });
    revalidateTag("users", { expire: 0 });

    const pwChanged = hashedPassword !== undefined;
    await logActivity(session.user.id, "update_user", `Updated user "${updated.name}" | Email: ${updated.email} | Role: ${updated.role}${pwChanged ? " | Password reset" : ""}`, id, "user");
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
    if (!auth.ok) return auth.response;

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

    // Prevent deletion if the user has created invoices/purchase bills/rate lists — all three
    // have a required (non-nullable) FK to User with no onDelete override, so deleting the user
    // row while any exist would otherwise surface as a raw, unhandled Prisma FK error instead of
    // this clear message. Counts are returned structured (not just baked into the message) so the
    // client can offer a "reassign, then delete" flow instead of just showing an error.
    const [invoiceCount, purchaseBillCount, rateListCount] = await Promise.all([
      prisma.invoice.count({ where: { userId: id } }),
      prisma.purchaseBill.count({ where: { createdByUserId: id } }),
      prisma.rateList.count({ where: { createdByUserId: id } }),
    ]);
    if (invoiceCount > 0 || purchaseBillCount > 0 || rateListCount > 0) {
      const parts: string[] = [];
      if (invoiceCount > 0) parts.push(`${invoiceCount} invoice(s)`);
      if (purchaseBillCount > 0) parts.push(`${purchaseBillCount} purchase bill(s)`);
      if (rateListCount > 0) parts.push(`${rateListCount} rate list(s)`);
      return NextResponse.json(
        {
          error: `Cannot delete "${targetUser.name}" — they have created ${parts.join(", ")}. Reassign them to another user first.`,
          invoiceCount,
          purchaseBillCount,
          rateListCount,
        },
        { status: 400 }
      );
    }

    await prisma.user.delete({ where: { id } });
    revalidateTag("users", { expire: 0 });

    await logActivity(session.user.id, "delete_user", `Deleted user "${targetUser.name}" | Role: ${targetUser.role} | Email: ${targetUser.email}`, id, "user");
    return NextResponse.json({ message: "User deleted" });
  } catch (error) {
    console.error("DELETE /api/admin/users/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}
