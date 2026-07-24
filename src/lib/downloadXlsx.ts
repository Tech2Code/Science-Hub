// Client-side companion to /api/export-xlsx — the actual .xlsx generation
// (ExcelJS) runs server-side so it never bloats the client bundle; this just
// posts the already-filtered/sorted rows the page has on hand and saves the
// returned file.
export async function downloadXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number)[][]
): Promise<void> {
  const res = await fetch("/api/export-xlsx", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, sheetName, headers, rows }),
  });
  if (!res.ok) throw new Error("Failed to generate Excel file");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
