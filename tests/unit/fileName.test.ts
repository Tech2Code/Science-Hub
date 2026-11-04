import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { safeFileBaseName, pdfFileName } from "@/lib/fileName";
import { sanitizeZipEntryName } from "@/lib/bulkPdfDownload";
import { NUMBER_FORMATS } from "@/lib/documentNumbering";

describe("safeFileBaseName", () => {
  it("keeps the WHOLE document number when it contains a slash (the share-sheet bug showed only '2026-27')", () => {
    expect(safeFileBaseName("02/2026-27")).toBe("02-2026-27");
    expect(safeFileBaseName("SH-02/2026-27")).toBe("SH-02-2026-27");
  });

  it("leaves a number that has no unsafe characters untouched", () => {
    expect(safeFileBaseName("SH-2026-27-0001")).toBe("SH-2026-27-0001");
    expect(safeFileBaseName("CN-2026-27-0002")).toBe("CN-2026-27-0002");
  });

  it("replaces every path separator and character Windows/macOS/Android reject", () => {
    expect(safeFileBaseName('a\\b/c:d*e?f"g<h>i|j%k')).toBe("a-b-c-d-e-f-g-h-i-j-k");
  });

  it("strips control characters, leading dots and trailing dots/spaces, collapses whitespace", () => {
    expect(safeFileBaseName("a\u0000b\nc")).toBe("a-b-c");
    expect(safeFileBaseName("..hidden")).toBe("hidden");
    expect(safeFileBaseName("name. . ")).toBe("name");
    expect(safeFileBaseName("a    b")).toBe("a b");
  });

  it("falls back instead of returning an empty or dots-only name", () => {
    expect(safeFileBaseName("")).toBe("document");
    expect(safeFileBaseName("...")).toBe("document");
    expect(safeFileBaseName("   ", "invoice")).toBe("invoice");
  });

  it("keeps non-ASCII letters and caps the length", () => {
    expect(safeFileBaseName("बिल 12/2026-27")).toBe("बिल 12-2026-27");
    expect(safeFileBaseName("x".repeat(500))).toHaveLength(120);
  });
});

describe("pdfFileName", () => {
  it("appends .pdf to the safe base name", () => {
    expect(pdfFileName("02/2026-27")).toBe("02-2026-27.pdf");
    expect(pdfFileName("")).toBe("document.pdf");
  });
});

describe("every numbering layout the admin can choose produces a usable, complete file name", () => {
  for (const [id, fmt] of Object.entries(NUMBER_FORMATS)) {
    it(`layout "${id}"`, () => {
      const number = fmt.render("SH", "2026-27", 7);
      const name = pdfFileName(number);
      expect(name).not.toMatch(/[\\/:*?"<>|%]/);
      // the sequence AND the financial year both survive (the bug dropped everything before the slash)
      expect(name).toContain("2026-27");
      expect(name).toMatch(/0?7/);
      expect(name.endsWith(".pdf")).toBe(true);
    });
  }
});

describe("ZIP entry names agree with download / share / email names", () => {
  it("sanitizeZipEntryName gives the same base name as safeFileBaseName for document numbers", () => {
    for (const n of ["02/2026-27", "SH-02/2026-27", "SH-2026-27-0001", "CN-2026-27-0001"]) {
      expect(sanitizeZipEntryName(n)).toBe(safeFileBaseName(n, "file"));
    }
  });
});

// Drift guard: any new `${invoiceNumber}.pdf`-style template re-opens the bug.
describe("no file name is built from a document number without the helper", () => {
  it("scans src for raw `${...}.pdf` templates", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(e.name)) files.push(full);
      }
    };
    walk(path.join(process.cwd(), "src"));
    const offenders: string[] = [];
    for (const f of files) {
      if (f.endsWith(path.join("lib", "fileName.ts"))) continue;
      const lines = fs.readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/\$\{([^}]*)\}\.pdf/g)) {
          const inner = m[1];
          const isDocumentNumber = /(invoiceNumber|billNumber|creditNoteNumber|\bnum\b|\bnumber\b)/.test(inner);
          const isSanitized = /(safeFileBaseName|sanitizeZipEntryName|pdfFileName)\(/.test(inner) || /baseName/.test(inner);
          if (isDocumentNumber && !isSanitized) offenders.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
