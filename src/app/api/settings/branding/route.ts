import { NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/db";

// Deliberately public (no auth) — this is exactly what's already displayed
// to anyone looking at the login/forgot-password/find-email/reset-password
// pages, so there's nothing sensitive in name/tagline/logoUrl. Exists so the
// client can self-correct the branding baked into the initial server render
// (see BrandingProvider) after a Settings update, instead of it staying
// stale until the next deployment on statically-optimized pages.
export async function GET() {
  try {
    const { name, tagline, logoUrl } = await getBusinessSettings();
    return NextResponse.json({ name, tagline, logoUrl });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to fetch branding" }, { status: 500 });
  }
}
