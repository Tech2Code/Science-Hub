import ExcelJS from "exceljs";

// Builds a single-sheet .xlsx buffer with columns auto-fit to their longest
// cell — unlike a CSV, which Excel always opens at a fixed default column
// width regardless of content, hiding anything longer than that behind the
// next column.
export async function buildXlsxBuffer(
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName.slice(0, 31)); // Excel sheet-name limit
  sheet.addRow(headers);
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);

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
