import { describe, it, expect } from "vitest";
import { computeRoundOff } from "@/lib/roundOff";

describe("computeRoundOff", () => {
  it("rounds down below the midpoint", () => {
    const { roundedTotal, roundOff } = computeRoundOff(100.4);
    expect(roundedTotal).toBe(100);
    expect(roundOff).toBeCloseTo(-0.4, 5);
  });

  it("rounds up at/above the midpoint", () => {
    const { roundedTotal, roundOff } = computeRoundOff(100.6);
    expect(roundedTotal).toBe(101);
    expect(roundOff).toBeCloseTo(0.4, 5);
  });

  it("returns a zero round-off for an already-whole total", () => {
    const { roundedTotal, roundOff } = computeRoundOff(100);
    expect(roundedTotal).toBe(100);
    expect(roundOff).toBe(0);
  });

  it("is not thrown off by float noise (e.g. 0.1 + 0.2 style artifacts)", () => {
    const { roundedTotal } = computeRoundOff(99.999999999);
    expect(roundedTotal).toBe(100);
  });
});
