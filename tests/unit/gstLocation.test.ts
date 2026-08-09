import { describe, it, expect } from "vitest";
import { deriveIsInterState } from "@/lib/gstLocation";

describe("deriveIsInterState", () => {
  it("returns false when place of supply matches the business's state (intra-state)", () => {
    expect(deriveIsInterState("Delhi", "Delhi")).toBe(false);
  });

  it("returns true when place of supply differs from the business's state (inter-state)", () => {
    expect(deriveIsInterState("Haryana", "Delhi")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(deriveIsInterState(" delhi ", "DELHI")).toBe(false);
  });

  it("returns null when the business state isn't configured yet", () => {
    expect(deriveIsInterState("Delhi", "")).toBeNull();
  });

  it("returns null when place of supply is blank", () => {
    expect(deriveIsInterState("", "Delhi")).toBeNull();
  });
});
