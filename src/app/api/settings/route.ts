import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/apiAuth";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { gmailAppPassword, ...settings } = await getBusinessSettings();
    // Never return the raw credential to the client — only whether one is set.
    return NextResponse.json({ ...settings, gmailAppPasswordSet: Boolean(gmailAppPassword) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.response;
    const body = await request.json();
    const { name, tagline, email, phone, address, city, state, pincode, gstin, gmailUser, gmailAppPassword } = body;
    const updateData: Record<string, string> = { name, tagline, email, phone, address, city, state, pincode, gstin, gmailUser: gmailUser ?? "" };
    // Save password when explicitly provided; if gmailUser is being cleared, clear password too
    if (gmailAppPassword) updateData.gmailAppPassword = gmailAppPassword;
    else if (!gmailUser) updateData.gmailAppPassword = "";
    const { gmailAppPassword: storedPassword, ...settings } = await prisma.businessSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...updateData },
      update: updateData,
    });
    return NextResponse.json({ ...settings, gmailAppPasswordSet: Boolean(storedPassword) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
