// Commercial rounding to the nearest rupee: 100.40 -> 100, 100.60 -> 101.
// roundOff is the signed adjustment (roundedTotal - rawTotal) so it can be
// printed as "+0.40" / "-0.60" on invoices and purchase bills.
export function computeRoundOff(rawTotal: number) {
  const precise = Math.round(rawTotal * 100) / 100; // guard against float noise
  const rounded = Math.round(precise);
  const roundOff = Math.round((rounded - precise) * 100) / 100;
  return { roundOff, roundedTotal: rounded };
}
