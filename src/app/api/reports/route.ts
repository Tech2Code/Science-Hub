import { NextRequest, NextResponse } from "next/server";
import { getReportSummary, getReportOutstanding, getReportStock } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (!type) {
      return NextResponse.json(
        { error: "Query parameter 'type' is required" },
        { status: 400 }
      );
    }

    if (type === "summary") {
      return NextResponse.json(await getReportSummary());
    }

    if (type === "outstanding") {
      return NextResponse.json(await getReportOutstanding());
    }

    if (type === "stock") {
      return NextResponse.json(await getReportStock());
    }

    return NextResponse.json(
      { error: `Unknown report type: ${type}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("GET /api/reports error:", error);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
