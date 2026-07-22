// Keeps the file extension visible (so the user can tell a .pdf from a .jpg
// at a glance) instead of truncating blindly from the end of the string.
export function truncateFilename(name: string, maxLength = 28): string {
  if (name.length <= maxLength) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && dot < name.length - 1 ? name.slice(dot) : "";
  const base = dot > 0 ? name.slice(0, dot) : name;
  const budget = Math.max(maxLength - ext.length - 1, 3);
  return `${base.slice(0, budget)}…${ext}`;
}
