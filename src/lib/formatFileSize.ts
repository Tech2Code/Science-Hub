// Human-readable byte size for attachment display (e.g. "240 KB", "1.5 MB").
// Uses binary units (1024) to match how OS file managers report sizes. Returns
// an empty string for null/invalid input so callers can render it inline without
// a separate guard.
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  // One decimal for MB/GB (e.g. "1.5 MB"), whole numbers for KB (e.g. "240 KB").
  const rounded = unitIndex === 0 ? Math.round(size) : Math.round(size * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}
