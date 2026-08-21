// Client-side companion to /api/export-xlsx — ExcelJS generation stays server-side to avoid bloating the client bundle.
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
