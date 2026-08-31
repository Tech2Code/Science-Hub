// Packages the GST filing workbook + a validation report CSV into the downloadable ZIP; validation is a separate file so it's reviewable without opening Excel.
import JSZip from "jszip";
import { buildGstFilingWorkbook } from "@/lib/gstFilingWorkbook";
import type { GstFilingReport } from "@/lib/gstFiling";
import { neutralizeFormulaCell } from "@/lib/formulaSafety";

function csvEscape(v: string | number): string {
  // CSV carries no per-cell type metadata, so unlike the .xlsx sheets, Excel really does
  // evaluate a leading =/+/-/@ as a formula the moment this file is opened — neutralize first.
  const s = String(neutralizeFormulaCell(v));
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
