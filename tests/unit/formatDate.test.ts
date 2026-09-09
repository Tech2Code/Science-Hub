import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatTime, formatMonthYear } from "@/lib/formatDate";

// These pin `timeZone: "Asia/Kolkata"` specifically so the rendered calendar day never depends on
// the runtime's own local timezone (the process running the test, Vercel's UTC-default serverless
// runtime, or a viewer's browser). Regression coverage for the recurring IST/UTC day-boundary bug
// class — see CLAUDE.md's date-handling "Do not" rules and the invoice/purchase-bill date fixes
// this test was added alongside.
describe("formatDate", () => {
  it("renders a UTC-midnight timestamp as the same IST calendar day (the exact bug-triggering shape)", () => {
    // This is what `istDayStartUtc("2026-09-09")` and Invoice.date/PurchaseBill.billDate look like
    // once an edit-form date string is stored — must still read as 09 Sep, not slip to 08 Sep.
    expect(formatDate("2026-09-09T00:00:00.000Z")).toBe("09 Sept 2026");
  });

  it("renders a late-UTC timestamp as the later IST calendar day it actually falls on", () => {
    // 2026-09-08T20:00Z + 5:30 = 2026-09-09T01:30 IST — a naive non-timezone-aware render (or one
    // pinned to a timezone behind UTC) would wrongly show this as 08 Sep.
    expect(formatDate("2026-09-08T20:00:00.000Z")).toBe("09 Sept 2026");
  });

  it("never crosses a day backward for any timezone at or ahead of UTC", () => {
    expect(formatDate("2026-01-01T00:00:00.000Z")).toBe("01 Jan 2026");
  });
});

describe("formatDateTime", () => {
  it("renders the IST date and time together", () => {
    expect(formatDateTime("2026-09-09T13:47:12.609Z")).toBe("09 Sept 2026, 07:17 pm");
  });
});

describe("formatTime", () => {
  it("renders only the IST time-of-day", () => {
    expect(formatTime("2026-09-09T13:47:12.609Z")).toBe("07:17 pm");
  });
});

describe("formatMonthYear", () => {
  it("renders an IST month/year label", () => {
    expect(formatMonthYear("2026-09-09T13:47:12.609Z")).toBe("September 2026");
  });

  it("renders the correct IST month even when the UTC month would differ", () => {
    // 2026-08-31T20:00Z + 5:30 = 2026-09-01T01:30 IST — must read as September, not August.
    expect(formatMonthYear("2026-08-31T20:00:00.000Z")).toBe("September 2026");
  });
});
