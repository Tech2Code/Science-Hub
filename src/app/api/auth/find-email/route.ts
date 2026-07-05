import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rateLimit";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  const visible = local.slice(0, 2);
  const masked = visible + "*".repeat(Math.max(3, local.length - 2));
  return `${masked}@${domain}`;
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Enter at least 2 characters." }, { status: 400 });
    }

    const limit = rateLimit(`find-email:${getClientIp(req)}`, 10, 15 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json({ results: [] });
    }

    const users = await prisma.user.findMany({
      where: { name: { contains: name.trim(), mode: "insensitive" } },
      select: { name: true, email: true },
      take: 5,
    });

    const results = users.map((u) => ({
      name: u.name,
      maskedEmail: maskEmail(u.email),
    }));

    return NextResponse.json({ results });
  } catch (err) {
    console.error("find-email error:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
