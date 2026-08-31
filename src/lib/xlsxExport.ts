import ExcelJS from "exceljs";
import { neutralizeFormulaCell } from "@/lib/formulaSafety";

// Builds a single-sheet .xlsx with columns auto-fit to their longest cell (unlike CSV, which Excel opens at a fixed default width).
export async function buildXlsxBuffer(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName.slice(0, 31)); // Excel sheet-name limit
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row.map(neutralizeFormulaCell));

  headers.forEach((header, i) => {
    let maxLen = header.length;
    for (const row of rows) {
      const len = String(row[i] ?? "").length;
      if (len > maxLen) maxLen = len;
    }
    sheet.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 10), 60);
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
