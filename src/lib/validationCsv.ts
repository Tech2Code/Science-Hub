// Shared "Validation-Report.csv" builder for both GST export ZIPs (gstFilingZip.ts, gstr1CsvZip.ts)
// — this file is explicitly meant to be opened in Excel by a human (unlike the machine-consumed
// section CSVs in gstr1CsvExport.ts, which target the GST Offline Tool's own parser instead), so
// every cell is run through neutralizeFormulaCell() first. Previously copy-pasted once per zip
// builder; kept in one place so the two can't silently diverge on that guard again.
import { neutralizeFormulaCell } from "@/lib/formulaSafety";
import type { ValidationIssue } from "@/lib/gstValidation";

function csvEscape(v: string | number): string {
  // CSV carries no per-cell type metadata, so Excel really does evaluate a leading =/+/-/@ as a
  // formula the moment this file is opened — neutralize first.
  const s = String(neutralizeFormulaCell(v));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildValidationCsv(issues: ValidationIssue[], noIssuesMessage: string): string {
  const header = ["Severity", "Category", "Reference", "Issue"];
  const rows = issues.length > 0
    ? issues.map((i) => [i.severity.toUpperCase(), i.category, i.reference ?? "", i.message])
    : [["OK", "-", "", noIssuesMessage]];
  // Leading BOM tells Excel the file is UTF-8 — without it, Excel assumes
  // Windows-1252 and multi-byte characters (₹, —, etc.) render as mojibake.
  return "﻿" + [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\n");
}
