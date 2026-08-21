import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/apiAuth";
import { buildGstFilingReport } from "@/lib/gstFiling";
import { buildGstFilingZip } from "@/lib/gstFilingZip";
import { buildGstFilingWorkbook } from "@/lib/gstFilingWorkbook";

// Sales+Purchase data merge here despite sitting behind separate permissions — an all-or-nothing
// gate avoids handing a partial, misleading filing package to a user with only one half.
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
    const formatParam = searchParams.get("format");
    const format = formatParam === "zip" ? "zip" : formatParam === "xlsx" ? "xlsx" : "json";

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

    // Content-Disposition must be ASCII/Latin-1 — use raw query dates, not report.period.label
    // (contains a non-Latin-1 en-dash that throws when set as a header).
    const fileLabel = `${startDate}_to_${endDate}`;

    if (format === "zip") {
      const zipBuffer = await buildGstFilingZip(report);
      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="GST-Filing-${fileLabel}.zip"`,
        },
      });
    }

    if (format === "xlsx") {
      const workbook = buildGstFilingWorkbook(report);
      const workbookBuffer = await workbook.xlsx.writeBuffer();
      return new NextResponse(new Uint8Array(workbookBuffer), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="GST-Filing-${fileLabel}.xlsx"`,
        },
      });
    }

    return NextResponse.json(report);
  } catch (error) {
    console.error("GET /api/gst-filing error:", error);
    return NextResponse.json({ error: "Failed to generate GST filing package" }, { status: 500 });
  }
}
