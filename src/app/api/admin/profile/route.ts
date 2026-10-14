import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";
import { rules, validate, validateUserInput } from "@/lib/validation";
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

async function resolveSessionUser(session: Awaited<ReturnType<typeof getServerSession<typeof authOptions>>>) {
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

    // Same shared rule as the Admin → Users routes and the client form (name >= 2 chars).
    const nameErr = validateUserInput({ name });
    if (nameErr) return NextResponse.json({ error: nameErr }, { status: 400 });

    // Email uniqueness check (against other users) — normalized the same
    // way login does, so case-variant duplicates can't be created here.
    const normalizedEmail = email !== undefined ? email.trim().toLowerCase() : undefined;
    if (normalizedEmail !== undefined) {
      const emailErr = validate(normalizedEmail, rules.required("Email is required."), rules.email());
      if (emailErr) return NextResponse.json({ error: emailErr }, { status: 400 });
    }
    const emailChanged = normalizedEmail !== undefined && normalizedEmail !== currentUser.email;
    if (emailChanged) {
      const conflict = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (conflict) {
        return NextResponse.json(
          { error: "A user with that email already exists", field: "email" },
          { status: 409 }
        );
      }
      // Changing the login email is an account-takeover vector for a session/cookie thief —
      // require the current password, same as a password change.
      const limit = rateLimit(`profile-password:${currentUser.id}`, 10, 15 * 60 * 1000);
      if (!limit.allowed) {
        return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
      }
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Enter your current password to change your email", field: "currentPassword" },
          { status: 400 }
        );
      }
      const validPw = await bcrypt.compare(currentPassword, currentUser.password);
      if (!validPw) {
        return NextResponse.json(
          { error: "Current password is incorrect", field: "currentPassword" },
          { status: 401 }
        );
      }
    }

    // Password change logic
    let hashedPassword: string | undefined;
    if (newPassword !== undefined) {
      // A session/cookie thief who doesn't know the real password could otherwise brute-force
      // currentPassword here with no login-page throttle to stop them — same shape as auth.ts's own limiter.
      const limit = rateLimit(`profile-password:${currentUser.id}`, 10, 15 * 60 * 1000);
      if (!limit.allowed) {
        return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
      }

      // Shared validator also enforces bcrypt's 72-BYTE cap — without it a longer password would be
      // silently truncated by bcrypt (any string sharing the first 72 bytes would then log in).
      const pwErr = validateUserInput({ password: newPassword }, { passwordLabel: "New password" });
      if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

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

      hashedPassword = await bcrypt.hash(newPassword, 12);
    }

    const updated = await prisma.user.update({
      where: { id: currentUser.id },
      data: {
        ...(name !== undefined && { name }),
        ...(normalizedEmail !== undefined && { email: normalizedEmail }),
        ...(hashedPassword !== undefined && { password: hashedPassword }),
        // Email change also invalidates existing sessions — the client signs the user out after this.
        ...((hashedPassword !== undefined || emailChanged) && { tokenVersion: { increment: 1 } }),
      },
      select: USER_SELECT,
    });
    revalidateTag("users", { expire: 0 });

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
