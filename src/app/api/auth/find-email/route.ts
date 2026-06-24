import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 2);
  const masked = visible + "*".repeat(Math.max(3, local.length - 2));
  return `${masked}@${domain}`;
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: "Enter at least 2 characters." }, { status: 400 });
    }

    const users = await prisma.user.findMany({
      where: { name: { contains: name.trim(), mode: "insensitive" } },
      select: { name: true, email: true, role: true },
      take: 5,
    });

    const results = users.map((u) => ({
      name: u.name,
      maskedEmail: maskEmail(u.email),
      role: u.role,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("find-email error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
