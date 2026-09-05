import JSZip from "jszip";
import type { GstFilingReport } from "@/lib/gstFiling";
import { buildGstr1CsvFiles } from "@/lib/gstr1CsvExport";
import { buildValidationCsv } from "@/lib/validationCsv";

const README = `GSTR-1 SECTION-WISE CSV FILES — HOW TO USE
============================================

These files match the GST Returns Offline Tool's own CSV import format
(Section_wise_CSV_files/GSTR1/*.csv in the tool's own download bundle).

1. Download and install the "Returns Offline Tool" from:
   https://www.gst.gov.in/download/returns

2. Open the tool and start (or open) a return for the relevant GSTIN and period.

3. Go to "Prepare Return" (Offline) > pick a section (B2B, B2CS, Credit/Debit
   Notes (Registered), HSN Summary) > "Import Files" > select the matching
   CSV from this folder:
     - b2b,sez,de.csv        -> B2B, SEZ, DE section
     - b2cs.csv               -> B2CS section
     - cdnr.csv                -> Credit/Debit Notes (Registered) section
     - hsn(b2b).csv            -> HSN Summary (B2B) section
     - hsn(b2c).csv            -> HSN Summary (B2C) section

4. Review each section inside the tool before generating the JSON — the tool
   itself will flag anything it can't accept.

5. Once every section looks right, use "Generate JSON File to Upload" in the
   tool, then upload that JSON on the GST portal under Returns > GSTR-1.

BEFORE YOU IMPORT — check Validation-Report.csv in this zip. Any ERROR row
means that item was skipped from the export entirely (e.g. an unrecognized
place of supply) — fix the underlying record in Science Hub and re-export
rather than editing these CSVs by hand.

This bundle deliberately does not cover: B2C Large invoices (invoice-wise,
above the statutory value threshold), exports, SEZ/deemed-export supplies,
e-commerce operator sales, or advances received — Science Hub doesn't
currently track those separately. If your business starts using any of
them, those sections still need to be filled in directly inside the
Offline Tool.
`;

export async function buildGstr1CsvZip(report: GstFilingReport): Promise<Buffer> {
  const { files, issues } = buildGstr1CsvFiles(report);
  const allIssues = [...report.validation.issues, ...issues];

  const zip = new JSZip();
  zip.file("README.txt", README);
  zip.file("Validation-Report.csv", buildValidationCsv(allIssues, "No issues detected in this export."));
  for (const f of files) zip.file(f.name, f.content);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
