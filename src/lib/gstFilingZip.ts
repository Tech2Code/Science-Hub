// Packages the GST filing workbook + a validation report CSV into the downloadable ZIP; validation is a separate file so it's reviewable without opening Excel.
import JSZip from "jszip";
import { buildGstFilingWorkbook } from "@/lib/gstFilingWorkbook";
import type { GstFilingReport } from "@/lib/gstFiling";
import { buildValidationCsv } from "@/lib/validationCsv";

export async function buildGstFilingZip(report: GstFilingReport): Promise<Buffer> {
  const workbook = buildGstFilingWorkbook(report);
  const workbookBuffer = await workbook.xlsx.writeBuffer();

  const zip = new JSZip();
  const fileLabel = `${report.period.startDate}_to_${report.period.endDate}`;
  zip.file(`GST-Filing-${fileLabel}.xlsx`, workbookBuffer);
  zip.file("Validation-Report.csv", buildValidationCsv(report.validation.issues, "No issues detected for this period."));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
