// Commercial rounding to the nearest rupee: 100.40 -> 100, 100.60 -> 101.
// roundOff is the signed adjustment (roundedTotal - rawTotal) so it can be
// printed as "+0.40" / "-0.60" on invoices and purchase bills.
export function computeRoundOff(rawTotal: number) {
  const precise = Math.round(rawTotal * 100) / 100; // guard against float noise
  const rounded = Math.round(precise);
  const roundOff = Math.round((rounded - precise) * 100) / 100;
  return { roundOff, roundedTotal: rounded };
}

// Splits a combined GST amount into two printed CGST/SGST figures that always foot back to the
// printed total — an intra-state invoice stores cgst=sgst=totalGst/2 (exact in raw float math), but
// rounding each half to 2dp independently for display can push both halves up on an odd-paisa total
// (e.g. totalGst=10.01 -> 5.005+5.005 both round to "5.01", printing 10.02 against an actual 10.01),
// so the printed CGST+SGST silently fails to foot to the printed Grand Total. Round the combined
// total once, then hand SGST whatever's left after CGST's independent rounding, so the two always
// sum to exactly the rounded total shown elsewhere on the same document.
export function splitGstForDisplay(totalGst: number): { cgst: number; sgst: number } {
  const roundedTotal = Math.round((totalGst + Number.EPSILON) * 100) / 100;
  const cgst = Math.round((roundedTotal / 2 + Number.EPSILON) * 100) / 100;
  const sgst = Math.round((roundedTotal - cgst) * 100) / 100;
  return { cgst, sgst };
}
