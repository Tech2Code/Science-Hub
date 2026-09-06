import { describe, it, expect } from "vitest";
import {
  rules, validate, validateCustomerInput, validateVendorInput, isFutureIstDate, validateNumericField, MAX_MONEY_VALUE,
  istDayStartUtc, istDayEndUtc, istTodayStartUtc, istMonthStartUtc, istNextMonthStartUtc, istMonthBoundsUtc,
} from "@/lib/validation";

describe("rules", () => {
  it("phone10 accepts empty (phone is optional everywhere it's used)", () => {
    expect(rules.phone10()("")).toBeNull();
  });
  it("phone10 accepts a valid 10-digit number", () => {
    expect(rules.phone10()("9876543210")).toBeNull();
  });
  it("phone10 rejects a malformed number", () => {
    expect(rules.phone10()("12345")).not.toBeNull();
    expect(rules.phone10()("98765432101")).not.toBeNull();
    expect(rules.phone10()("abcdefghij")).not.toBeNull();
  });

  it("gstin accepts empty and rejects wrong-length strings", () => {
    expect(rules.gstin()("")).toBeNull();
    expect(rules.gstin()("22AAAAA0000A1Z5")).toBeNull(); // 15 chars
    expect(rules.gstin()("22AAAAA0000A1Z")).not.toBeNull(); // 14 chars
  });

  it("required rejects blank/whitespace-only", () => {
    expect(rules.required()("")).not.toBeNull();
    expect(rules.required()("   ")).not.toBeNull();
    expect(rules.required()("x")).toBeNull();
  });

  it("percentRange accepts empty (optional unless paired with required)", () => {
    expect(rules.percentRange(100)("")).toBeNull();
  });

  it("percentRange accepts the boundaries 0 and max", () => {
    expect(rules.percentRange(100)("0")).toBeNull();
    expect(rules.percentRange(100)("100")).toBeNull();
  });

  it("percentRange rejects a negative value", () => {
    expect(rules.percentRange(100)("-1")).not.toBeNull();
  });

  it("percentRange rejects a value over max", () => {
    expect(rules.percentRange(100)("101")).not.toBeNull();
  });

  it("percentRange rejects a non-numeric string", () => {
    expect(rules.percentRange(100)("abc")).not.toBeNull();
  });

  it("percentRange honors a custom max", () => {
    expect(rules.percentRange(50)("50")).toBeNull();
    expect(rules.percentRange(50)("60")).not.toBeNull();
  });

  it("percentRange uses the default message when none is supplied", () => {
    expect(rules.percentRange(50)("60")).toBe("Value must be between 0 and 50.");
  });

  it("percentRange uses a custom message when supplied", () => {
    expect(rules.percentRange(100, "custom message")("150")).toBe("custom message");
  });
});

describe("validateNumericField", () => {
  it("rejects Infinity when a finite max is supplied, even though Infinity > 0", () => {
    expect(validateNumericField("price", Infinity, { min: 0, max: MAX_MONEY_VALUE })).not.toBeNull();
  });

  it("rejects a value above MAX_MONEY_VALUE", () => {
    expect(validateNumericField("price", MAX_MONEY_VALUE + 1, { min: 0, max: MAX_MONEY_VALUE })).not.toBeNull();
  });

  it("accepts a real-world price well within MAX_MONEY_VALUE", () => {
    expect(validateNumericField("price", 12500, { min: 0, max: MAX_MONEY_VALUE })).toBeNull();
  });

  it("rejects NaN", () => {
    expect(validateNumericField("price", NaN, { min: 0, max: MAX_MONEY_VALUE })).not.toBeNull();
  });
});

describe("validate", () => {
  it("returns the first failing validator's message, short-circuiting the rest", () => {
    const err = validate("", rules.required("name required"), rules.maxLength(3, "too long"));
    expect(err).toBe("name required");
  });
  it("returns null when every validator passes", () => {
    expect(validate("ok", rules.required(), rules.maxLength(10))).toBeNull();
  });
});

describe("validateCustomerInput", () => {
  it("requires only a name when requireContactDetails is false", () => {
    expect(validateCustomerInput({ name: "Acme" }, false)).toBeNull();
  });

  it("does not require phone even when requireContactDetails is true (regression: phone was made optional)", () => {
    const err = validateCustomerInput(
      { name: "Acme", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
      true
    );
    expect(err).toBeNull();
  });

  it("still requires address/city/state/pincode when requireContactDetails is true", () => {
    expect(validateCustomerInput({ name: "Acme" }, true)).toBe("Address is required.");
    expect(validateCustomerInput({ name: "Acme", address: "x" }, true)).toBe("City is required.");
  });

  it("rejects a malformed phone if one is supplied, even though it's optional", () => {
    const err = validateCustomerInput(
      { name: "Acme", address: "x", city: "x", state: "x", pincode: "110001", phone: "123" },
      true
    );
    expect(err).toMatch(/phone/i);
  });

  it("rejects a blank name", () => {
    expect(validateCustomerInput({ name: "" }, false)).toBe("Name is required.");
  });
});

describe("validateVendorInput", () => {
  it("does not require phone (regression: phone was made optional)", () => {
    const err = validateVendorInput(
      { name: "Acme Supplies", address: "1 Main St", city: "Delhi", state: "Delhi", pincode: "110001" },
      true
    );
    expect(err).toBeNull();
  });

  it("still requires name", () => {
    expect(validateVendorInput({ name: "" }, false)).toBe("Vendor name is required.");
  });
});

describe("isFutureIstDate", () => {
  it("treats today's calendar date (IST) as not future", () => {
    const todayIst = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(isFutureIstDate(todayIst)).toBe(false);
  });

  it("treats a date far in the past as not future", () => {
    expect(isFutureIstDate("2000-01-01")).toBe(false);
  });

  it("treats a date far in the future as future", () => {
    expect(isFutureIstDate("2999-01-01")).toBe(true);
  });
});

describe("istMonthStartUtc / istNextMonthStartUtc / istMonthBoundsUtc", () => {
  it("istMonthStartUtc returns the IST midnight of the 1st of the given instant's IST month", () => {
    // 2026-09-06T07:51:30Z = 2026-09-06 13:21:30 IST -> September's IST month start
    const d = new Date("2026-09-06T07:51:30.000Z");
    expect(istMonthStartUtc(d).toISOString()).toBe(istDayStartUtc("2026-09-01").toISOString());
  });

  it("istNextMonthStartUtc rolls over to January of the next year from December", () => {
    // 2026-12-15 IST -> next month start is 2027-01-01 IST midnight
    const d = new Date("2026-12-15T06:00:00.000Z");
    expect(istNextMonthStartUtc(d).toISOString()).toBe(istDayStartUtc("2027-01-01").toISOString());
  });

  it("istMonthBoundsUtc rolls over correctly from month index 11 (December) to next January", () => {
    const { start, end } = istMonthBoundsUtc(2026, 11);
    expect(start.toISOString()).toBe(istDayStartUtc("2026-12-01").toISOString());
    expect(end.toISOString()).toBe(istDayStartUtc("2027-01-01").toISOString());
  });

  it("istMonthBoundsUtc handles a normal mid-year month", () => {
    const { start, end } = istMonthBoundsUtc(2026, 5); // June (0-based)
    expect(start.toISOString()).toBe(istDayStartUtc("2026-06-01").toISOString());
    expect(end.toISOString()).toBe(istDayStartUtc("2026-07-01").toISOString());
  });

  it("istTodayStartUtc matches istDayStartUtc of the same instant's IST calendar day", () => {
    const d = new Date("2026-09-06T20:00:00.000Z"); // 2026-09-07 01:30 IST
    expect(istTodayStartUtc(d).toISOString()).toBe(istDayStartUtc("2026-09-07").toISOString());
  });
});

describe("istDayStartUtc / istDayEndUtc", () => {
  it("start-of-day sits 5.5 hours before the naive UTC-midnight parse of the same date string", () => {
    const naiveUtcMidnight = new Date("2026-09-06T00:00:00.000Z").getTime();
    expect(istDayStartUtc("2026-09-06").getTime()).toBe(naiveUtcMidnight - 5.5 * 60 * 60 * 1000);
  });

  it("end-of-day sits 5.5 hours before the naive UTC end-of-day parse of the same date string", () => {
    const naiveUtcEnd = new Date("2026-09-06T23:59:59.999Z").getTime();
    expect(istDayEndUtc("2026-09-06").getTime()).toBe(naiveUtcEnd - 5.5 * 60 * 60 * 1000);
  });

  it("a timestamp created just after IST midnight falls within that IST day's bounds, not the previous UTC day's", () => {
    // 2026-09-05T19:00:00Z = 2026-09-06 00:30 IST — a real invoice/payment timestamp that a bare
    // UTC-midnight boundary would wrongly exclude from "2026-09-06"'s range.
    const t = new Date("2026-09-05T19:00:00.000Z").getTime();
    expect(t).toBeGreaterThanOrEqual(istDayStartUtc("2026-09-06").getTime());
    expect(t).toBeLessThanOrEqual(istDayEndUtc("2026-09-06").getTime());
  });
});
