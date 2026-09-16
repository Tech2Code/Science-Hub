import { NextRequest, NextResponse } from "next/server";
import { requireGstFilingAccess } from "@/lib/apiAuth";
import { buildGstFilingReport } from "@/lib/gstFiling";
import { buildGstFilingZip } from "@/lib/gstFilingZip";
import { buildGstFilingWorkbook } from "@/lib/gstFilingWorkbook";
import { buildGstr1CsvZip } from "@/lib/gstr1CsvZip";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireGstFilingAccess();
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const formatParam = searchParams.get("format");
    const format =
      formatParam === "zip" ? "zip" :
      formatParam === "xlsx" ? "xlsx" :
      formatParam === "gstr1csv" ? "gstr1csv" : "json";

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

    if (format === "gstr1csv") {
      const zipBuffer = await buildGstr1CsvZip(report);
      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="GSTR1-CSV-${fileLabel}.zip"`,
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
