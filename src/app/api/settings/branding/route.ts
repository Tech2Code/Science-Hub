import { NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";

// Deliberately public — name/tagline/logoUrl are already shown on unauthenticated pages,
// and this lets BrandingProvider refresh them after a Settings update without a redeploy.
export async function GET() {
  try {
    const { name, tagline, logoUrl } = await getBusinessSettings();
    return NextResponse.json({ name, tagline, logoUrl });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch branding" }, { status: 500 });
  }
}
