import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { requireSession, requireAdmin } from "@/lib/apiAuth";
import { encrypt } from "@/lib/crypto";

export async function GET() {
  try {
    const auth = await requireSession();
    if (!auth.ok) return auth.response;

    const { gmailAppPassword, gmailUser, ...settings } = await getBusinessSettings();
    // Non-admins (e.g. staff viewing/printing an invoice, which needs the
    // letterhead fields below) must not see the Gmail send-from address —
    // only admins, who manage it on the Settings page, get it back.
    const isAdmin = auth.session.user.role === "admin";
    return NextResponse.json({
      ...settings,
      ...(isAdmin ? { gmailUser, gmailAppPasswordSet: Boolean(gmailAppPassword) } : {}),
    });
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
    if (gmailAppPassword) updateData.gmailAppPassword = encrypt(gmailAppPassword);
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
