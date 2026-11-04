// "Where do you want to save this?" support for large downloads (bulk ZIPs).
//
// A plain `<a download>` click gives the page no way to know whether the browser then showed a Save-As dialog,
// whether the user chose a place or cancelled, or when the file actually reached the disk — so an app that toasts
// "Downloaded" right after the click can be wrong. Chromium browsers (Chrome/Edge, desktop) offer the File System
// Access API, where the PAGE opens the Save dialog and writes the file itself, so it genuinely knows. It must be
// opened from the user's click (transient activation), so callers ask for the location FIRST, then do the slow work.
// Browsers without it (Firefox, Safari, mobile) fall back to the normal download, and the caller words its toast
// as "download started" because that is all that can be known there.

interface WritableLike { write(data: Blob): Promise<void>; close(): Promise<void> }
interface HandleLike { createWritable(): Promise<WritableLike>; remove?: () => Promise<void> }
type PickerFn = (options: { suggestedName?: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<HandleLike>;

export type SaveTarget =
  | { kind: "picked"; handle: HandleLike }
  | { kind: "unsupported" };

export type AskResult = SaveTarget | { kind: "cancelled" };

/** Opens the browser's Save dialog (where supported). Call it first thing in a click handler, before any `await`. */
export async function askSaveLocation(fileName: string, mime = "application/zip"): Promise<AskResult> {
  const picker = (window as unknown as { showSaveFilePicker?: PickerFn }).showSaveFilePicker;
  if (typeof picker !== "function") return { kind: "unsupported" };
  const ext = fileName.includes(".") ? fileName.slice(fileName.lastIndexOf(".")) : "";
  try {
    const handle = await picker.call(window, {
      suggestedName: fileName,
      ...(ext ? { types: [{ description: ext.slice(1).toUpperCase() + " file", accept: { [mime]: [ext] } }] } : {}),
    });
    return { kind: "picked", handle };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { kind: "cancelled" };
    // Blocked (no user gesture, iframe, policy…) — fall back to a normal download rather than failing the action.
    return { kind: "unsupported" };
  }
}

/** Writes the blob where the user chose ("saved"), or starts a normal browser download ("started"). */
export async function deliverBlob(blob: Blob, fileName: string, target: SaveTarget): Promise<"saved" | "started"> {
  if (target.kind === "picked") {
    const writable = await target.handle.createWritable();
    try {
      await writable.write(blob);
    } finally {
      await writable.close();
    }
    return "saved";
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "started";
}

/** The Save dialog may already have created an empty file; when the run produced nothing, try to remove it (best effort). */
export async function discardSaveTarget(target: SaveTarget | undefined): Promise<void> {
  if (target?.kind !== "picked") return;
  try { await target.handle.remove?.(); } catch { /* not supported / already gone */ }
}
