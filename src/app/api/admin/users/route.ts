import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { logActivity } from "@/lib/activity";
import { validateUserInput } from "@/lib/validation";
import { requireAdmin } from "@/lib/apiAuth";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  createdAt: true,
  _count: { select: { invoices: true } },
} as const;

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const users = await prisma.user.findMany({
      select: USER_SELECT,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(users);
  } catch (error) {
    console.error("GET /api/admin/users error:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { name, email, password, role } = body as {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
    };

    const validationError = validateUserInput({ name, email, password, role }, { requireAll: true });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
    // `requireAll` above guarantees all four are non-empty strings.
    const validName = name as string, validRole = role as string;

    // Normalize case the same way login does (auth.ts lowercases the
    // submitted email before lookup) — otherwise "Foo@x.com" and "foo@x.com"
    // are treated as distinct accounts here but collide at login.
    const normalizedEmail = (email as string).trim().toLowerCase();

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return NextResponse.json(
        { error: "A user with that email already exists" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password as string, 12);

    const user = await prisma.user.create({
      data: { name: validName, email: normalizedEmail, password: hashedPassword, role: validRole },
      select: USER_SELECT,
    });

    const { session } = auth;
    await logActivity(session.user.id, "add_user", `Created user "${validName}" | Role: ${validRole} | Email: ${normalizedEmail}`, user.id, "user");
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("POST /api/admin/users error:", error);
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
