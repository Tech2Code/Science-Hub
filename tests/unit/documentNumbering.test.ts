import { describe, it, expect } from "vitest";
import {
  deriveDefaultPrefix,
  getIndianFinancialYear,
  formatFinancialYearLabel,
  NUMBER_FORMATS,
  resolveNumberFormat,
  numberFormatDbFilter,
  findMaxSequence,
  computeNextNumber,
} from "@/lib/documentNumbering";

describe("deriveDefaultPrefix", () => {
  it("uses initials for a multi-word business name", () => {
    expect(deriveDefaultPrefix("Science Hub")).toBe("SH");
  });

  it("caps at 4 initials for a longer name", () => {
    expect(deriveDefaultPrefix("Apex Scientific and Lab Supplies")).toBe("ASAL");
  });

  it("uses the first 3 letters for a single-word business name", () => {
    expect(deriveDefaultPrefix("Acme")).toBe("ACM");
  });

  it("strips non-alphanumeric characters", () => {
    expect(deriveDefaultPrefix("A&B Co.")).toBe("AC");
  });

  it("falls back to INV when nothing usable remains", () => {
    expect(deriveDefaultPrefix("&& ...")).toBe("INV");
  });
});

describe("getIndianFinancialYear", () => {
  it("puts a January date in the FY that started the previous April", () => {
    expect(getIndianFinancialYear(new Date(2027, 0, 15))).toBe(2026);
  });

  it("puts a March date in the FY that started the previous April", () => {
    expect(getIndianFinancialYear(new Date(2027, 2, 31))).toBe(2026);
  });

  it("puts an April date in the FY starting that same year", () => {
    expect(getIndianFinancialYear(new Date(2026, 3, 1))).toBe(2026);
  });

  it("puts a December date in the FY starting that same year", () => {
    expect(getIndianFinancialYear(new Date(2026, 11, 31))).toBe(2026);
  });
});

describe("formatFinancialYearLabel", () => {
  it("renders a normal year pair", () => {
    expect(formatFinancialYearLabel(2026)).toBe("2026-27");
  });

  it("wraps the short end-year across a century boundary", () => {
    expect(formatFinancialYearLabel(2099)).toBe("2099-00");
  });
});

describe("NUMBER_FORMATS", () => {
  it("prefix_fy_seq renders and matches a 4-digit padded sequence", () => {
    const f = NUMBER_FORMATS.prefix_fy_seq;
    const rendered = f.render("SH", "2026-27", 7);
    expect(rendered).toBe("SH-2026-27-0007");
    const m = rendered.match(f.matcher("SH", "2026-27"));
    expect(m?.[1]).toBe("0007");
  });

  it("seq_fy renders without a prefix or zero-padding", () => {
    const f = NUMBER_FORMATS.seq_fy;
    const rendered = f.render("SH", "2026-27", 18);
    expect(rendered).toBe("18/2026-27");
    const m = rendered.match(f.matcher("SH", "2026-27"));
    expect(m?.[1]).toBe("18");
  });

  it("prefix_seq_fy renders with a prefix but no zero-padding", () => {
    const f = NUMBER_FORMATS.prefix_seq_fy;
    const rendered = f.render("PB", "2026-27", 5);
    expect(rendered).toBe("PB-5/2026-27");
    const m = rendered.match(f.matcher("PB", "2026-27"));
    expect(m?.[1]).toBe("5");
  });

  it("a format's matcher does not match a different prefix or FY", () => {
    const f = NUMBER_FORMATS.prefix_fy_seq;
    expect(f.matcher("SH", "2026-27").test("PB-2026-27-0001")).toBe(false);
    expect(f.matcher("SH", "2026-27").test("SH-2025-26-0001")).toBe(false);
  });

  it("prefix containing regex-special characters is escaped safely in the matcher", () => {
    const f = NUMBER_FORMATS.prefix_fy_seq;
    // A prefix like "A.B" must be matched literally, not "A" + any-char + "B".
    expect(f.matcher("A.B", "2026-27").test("AxB-2026-27-0001")).toBe(false);
    expect(f.matcher("A.B", "2026-27").test("A.B-2026-27-0001")).toBe(true);
  });
});

describe("resolveNumberFormat", () => {
  it("returns the requested format when valid", () => {
    expect(resolveNumberFormat("seq_fy").id).toBe("seq_fy");
  });

  it("falls back to prefix_fy_seq for null/undefined/unknown", () => {
    expect(resolveNumberFormat(null).id).toBe("prefix_fy_seq");
    expect(resolveNumberFormat(undefined).id).toBe("prefix_fy_seq");
    expect(resolveNumberFormat("not-a-real-format").id).toBe("prefix_fy_seq");
  });
});

describe("numberFormatDbFilter", () => {
  it("prefix_fy_seq narrows by startsWith only", () => {
    expect(numberFormatDbFilter("prefix_fy_seq", "SH", "2026-27")).toEqual({
      startsWith: "SH-2026-27-",
    });
  });

  it("seq_fy narrows by endsWith only (sequence isn't a fixed prefix)", () => {
    expect(numberFormatDbFilter("seq_fy", "SH", "2026-27")).toEqual({
      endsWith: "/2026-27",
    });
  });

  it("prefix_seq_fy narrows by both startsWith and endsWith", () => {
    expect(numberFormatDbFilter("prefix_seq_fy", "PB", "2026-27")).toEqual({
      startsWith: "PB-",
      endsWith: "/2026-27",
    });
  });
});

describe("findMaxSequence", () => {
  it("finds the true numeric max even when string-sort order would disagree", () => {
    // "9/..." sorts after "10/..." lexicographically — this is exactly the
    // bug findMaxSequence exists to avoid for non-zero-padded formats.
    const matcher = NUMBER_FORMATS.seq_fy.matcher("", "2026-27");
    const numbers = ["2/2026-27", "10/2026-27", "9/2026-27", "1/2026-27"];
    expect(findMaxSequence(numbers, matcher)).toBe(10);
  });

  it("ignores numbers that don't match this prefix/FY at all", () => {
    const matcher = NUMBER_FORMATS.prefix_fy_seq.matcher("SH", "2026-27");
    const numbers = ["PB-2026-27-0099", "SH-2025-26-0050", "SH-2026-27-0003"];
    expect(findMaxSequence(numbers, matcher)).toBe(3);
  });

  it("returns 0 when nothing matches", () => {
    const matcher = NUMBER_FORMATS.prefix_fy_seq.matcher("SH", "2026-27");
    expect(findMaxSequence([], matcher)).toBe(0);
  });
});

describe("computeNextNumber", () => {
  it("increments one past the highest existing sequence when no override is set", () => {
    const result = computeNextNumber(
      ["SH-2026-27-0001", "SH-2026-27-0002"],
      "prefix_fy_seq",
      "SH",
      "2026-27",
      null
    );
    expect(result).toEqual({ documentNumber: "SH-2026-27-0003", overrideUsed: false });
  });

  it("starts at 1 when there are no existing numbers yet", () => {
    const result = computeNextNumber([], "prefix_fy_seq", "SH", "2026-27", null);
    expect(result).toEqual({ documentNumber: "SH-2026-27-0001", overrideUsed: false });
  });

  it("uses the override when it's greater than the highest existing sequence", () => {
    const result = computeNextNumber(
      ["SH-2026-27-0003"],
      "prefix_fy_seq",
      "SH",
      "2026-27",
      50
    );
    expect(result).toEqual({ documentNumber: "SH-2026-27-0050", overrideUsed: true });
  });

  it("ignores the override when it's not greater than the highest existing sequence", () => {
    // Mirrors the server-side guard in Settings' PUT handler, which itself
    // rejects a non-increasing override before it ever reaches this
    // function — this covers computeNextNumber's own defensive fallback.
    const result = computeNextNumber(
      ["SH-2026-27-0010"],
      "prefix_fy_seq",
      "SH",
      "2026-27",
      5
    );
    expect(result).toEqual({ documentNumber: "SH-2026-27-0011", overrideUsed: false });
  });

  it("defaults to prefix_fy_seq when formatId is unset", () => {
    const result = computeNextNumber([], undefined, "SH", "2026-27", null);
    expect(result.documentNumber).toBe("SH-2026-27-0001");
  });
});
