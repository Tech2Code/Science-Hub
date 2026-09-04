// E-way Bill (CGST Rule 138) applies once a single document's consignment value crosses a threshold —
// ₹50,000 is the pan-India baseline for inter-state movement; several states also apply it (or a
// higher figure, or an exemption) intra-state. This app doesn't attempt to model every state's own
// notification, so a crossed invoice/bill is flagged as "may require" rather than asserted as certain —
// the business must still confirm against their own state's current rule before relying on this list.
export const EWAY_BILL_THRESHOLD = 50000;

export interface EwayBillSalesRow {
  id: string; invoiceNumber: string; date: string; customerName: string;
  placeOfSupply: string | null; isInterState: boolean; total: number;
}
export interface EwayBillPurchaseRow {
  id: string; billNumber: string; billDate: string; vendorName: string;
  placeOfSupply: string | null; isInterState: boolean; total: number;
}
