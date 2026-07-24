// Packages the GST filing workbook + a separate validation report CSV into
// the downloadable ZIP — the "Download GST Package" a business owner sends
// to their CA. Validation stays its own file (not a sheet in the workbook)
// so it can be reviewed without opening Excel.
import JSZip from "jszip";
import { buildGstFilingWorkbook } from "@/lib/gstFilingWorkbook";
import type { GstFilingReport } from "@/lib/gstFiling";

function csvEscape(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function validationCsv(report: GstFilingReport): string {
  const header = ["Severity", "Category", "Reference", "Issue"];
  const rows = report.validation.issues.length > 0
    ? report.validation.issues.map((i) => [i.severity.toUpperCase(), i.category, i.reference ?? "", i.message])
    : [["OK", "-", "", "No issues detected for this period."]];
  // Leading BOM tells Excel the file is UTF-8 — without it, Excel assumes
  // Windows-1252 and multi-byte characters (₹, —, etc.) render as mojibake.
  return "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}

export async function buildGstFilingZip(report: GstFilingReport): Promise<Buffer> {
  const workbook = buildGstFilingWorkbook(report);
  const workbookBuffer = await workbook.xlsx.writeBuffer();

  const zip = new JSZip();
  const fileLabel = `${report.period.startDate}_to_${report.period.endDate}`;
  zip.file(`GST-Filing-${fileLabel}.xlsx`, workbookBuffer);
  zip.file("Validation-Report.csv", validationCsv(report));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
