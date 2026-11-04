// Shapes of the invoice detail API response and the business settings, shared by the invoice detail
// page and its print-area component. Moved verbatim out of sales/invoices/[id]/page.tsx.

export interface InvoiceItem {
  id: string; productId: string; name: string; unit: string; hsn?: string;
  quantity: number; price: number; discountPercent?: number; discountAmount?: number;
  gstRate: number; gstAmount: number; total: number;
}
export interface Payment {
  id: string; date: string; amount: number; method: string; reference: string;
}
export interface ReturnRecord {
  id: string; date: string; notes: string | null; createdAt: string;
  creditNoteNumber: string | null;
  subtotal: number; cgst: number; sgst: number; igst: number; roundOff: number; total: number;
  items: { id: string; name: string; quantity: number; price: number; discountPercent?: number; gstRate: number; gstAmount: number; total: number; productId: string | null }[];
}

export interface Invoice {
  id: string; invoiceNumber: string; date: string; dueDate?: string; createdAt: string;
  status: string; isInterState: boolean; placeOfSupply?: string; reverseCharge?: boolean; ewayBillNumber?: string | null;
  createdBy?: { id: string; name: string } | null;
  customer: { name: string; phone: string; email: string; address: string; city: string; state: string; pincode: string; gstin: string; updatedAt?: string; };
  items: InvoiceItem[];
  payments: Payment[];
  subtotal: number; cgst: number; sgst: number; igst: number;
  transportCharge?: number; transportChargeGstRate?: number; transportChargeGstAmount?: number;
  total: number; roundOff: number; paidAmount: number; notes: string;
}

export interface BusinessSettings {
  name: string; tagline: string; email: string; phone: string;
  address: string; city: string; state: string; pincode: string; gstin: string; pan?: string;
  termsAndConditions?: string;
  bankName?: string; bankAccountName?: string; bankAccountNumber?: string; bankIfsc?: string; bankBranch?: string;
  logoUrl?: string;
  showLogoOnInvoices?: boolean;
  updatedAt?: string;
}

export const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// A returned line's own `price` is the original invoice line's List Price (gross, pre-discount) —
// this derives the actual net rate charged/refunded, same as the main item table's Rate (₹) column.
export const returnItemRate = (ri: { price: number; discountPercent?: number }) => ri.price * (1 - (ri.discountPercent ?? 0) / 100);
