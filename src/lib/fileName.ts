// File names built from a document number.
//
// Invoice / purchase-bill / credit-note numbers are admin-configurable and two of the layouts contain "/"
// ("02/2026-27", "SH-02/2026-27" — see NUMBER_FORMATS in documentNumbering.ts). A "/" in a file name is a path
// separator, so `new File([blob], "02/2026-27.pdf")` shared through the phone's share sheet shows up as just
// "2026-27.pdf", and a plain download is renamed differently by every browser ("02_2026-27.pdf" in Chrome). Always
// build the name through this helper so the whole number survives and every channel (download, share, email
// attachment, ZIP entry) produces the same name.

// Path separators plus the characters Windows/macOS/Android refuse in a file name, and control characters.
const UNSAFE_CHARS = /[\\/:*?"<>|%\u0000-\u001f]/g;

/** "02/2026-27" -> "02-2026-27", "SH-02/2026-27" -> "SH-02-2026-27". Never returns an empty string. */
export function safeFileBaseName(name: string, fallback = "document"): string {
  const cleaned = name
    .replace(UNSAFE_CHARS, "-")
    .replace(/\s+/g, " ")
    .trim()
    // No leading dots (hidden file / ".."), no trailing dots or spaces (Windows strips them).
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .slice(0, 120);
  return cleaned || fallback;
}

/** `${safeFileBaseName(name)}.pdf` */
export function pdfFileName(name: string, fallback = "document"): string {
  return `${safeFileBaseName(name, fallback)}.pdf`;
}
