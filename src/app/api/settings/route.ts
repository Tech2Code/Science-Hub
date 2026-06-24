import { NextRequest, NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    const settings = await getBusinessSettings();
    return NextResponse.json(settings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user?.role !== "admin") {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }
    const body = await request.json();
    const { name, tagline, email, phone, address, city, state, pincode, gstin, gmailUser, gmailAppPassword } = body;
    const updateData: Record<string, string> = { name, tagline, email, phone, address, city, state, pincode, gstin, gmailUser: gmailUser ?? "" };
    // Save password when explicitly provided; if gmailUser is being cleared, clear password too
    if (gmailAppPassword) updateData.gmailAppPassword = gmailAppPassword;
    else if (!gmailUser) updateData.gmailAppPassword = "";
    const settings = await prisma.businessSettings.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", ...updateData },
      update: updateData,
    });
    return NextResponse.json(settings);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
