import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { buildGstFilingReport } from "@/lib/gstFiling";
import { buildGstFilingZip } from "@/lib/gstFilingZip";

// The GST Filing package merges Sales AND Purchase data, which normally sit
// behind separate section permissions (reports_sales / reports_purchases) —
// a combined all-or-nothing gate here avoids handing a partial (and
// potentially misleading) filing package to a user who only has one half.
async function requireGstFilingAccess() {
  const auth = await requireSession();
  if (!auth.ok) return auth;
  const { role, sections } = auth.session.user;
  if (role === "admin") return auth;
  const userSections = Array.isArray(sections) ? sections : [];
  if (!userSections.includes("reports_sales") || !userSections.includes("reports_purchases")) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "GST Filing requires both Sales Reports and Purchase Reports access." },
        { status: 403 }
      ),
    };
  }
  return auth;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireGstFilingAccess();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const format = searchParams.get("format") === "zip" ? "zip" : "json";

    if (!startDate || !endDate) {
      return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
    }
    if (isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) {
      return NextResponse.json({ error: "Invalid startDate or endDate" }, { status: 400 });
    }
    if (startDate > endDate) {
      return NextResponse.json({ error: "startDate must be before endDate" }, { status: 400 });
    }

    const report = await buildGstFilingReport(startDate, endDate);

    if (format === "zip") {
      const zipBuffer = await buildGstFilingZip(report);
      // Content-Disposition must be ASCII/Latin-1 — build the filename from
      // the raw "YYYY-MM-DD" query dates, not report.period.label (which
      // contains a non-Latin-1 en-dash "–" and throws when set as a header).
      const fileLabel = `${startDate}_to_${endDate}`;
      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="GST-Package-${fileLabel}.zip"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("GET /api/gst-filing error:", error);
    return NextResponse.json({ error: "Failed to generate GST filing package" }, { status: 500 });
  }
}
