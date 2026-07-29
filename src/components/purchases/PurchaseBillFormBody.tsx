"use client";

import type { ReactNode } from "react";
import { BillDetailsCard } from "@/components/purchases/BillDetailsCard";
import { PurchaseBillItemsTable } from "@/components/purchases/PurchaseBillItemsTable";
import { PurchaseBillTotals } from "@/components/purchases/PurchaseBillTotals";
import type { PurchaseBillLineItem, PurchaseBillProduct, PurchaseBillVendor } from "@/lib/purchaseBillForm";
import styles from "./PurchaseBillFormBody.module.css";

interface PurchaseBillFormBodyProps {
  /** Section-index the leftCol's Bill Details card starts at — lets a page with content above this (e.g. a stat strip) keep its stagger animation sequential. */
  startIndex?: number;

  vendors: PurchaseBillVendor[];
  vendorId: string;
  onVendorIdChange: (id: string) => void;
  onVendorCreated: (vendor: PurchaseBillVendor) => void;
  vendorError?: string;
  category: string;
  onCategoryChange: (category: string) => void;
  billDate: string;
  onBillDateChange: (date: string) => void;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  notes: string;
  onNotesChange: (notes: string) => void;
  attachmentUploading: boolean;
  attachmentName: string | null;
  attachmentUrl?: string | null;
  onAttachmentFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAttachmentRemove: () => void;

  products: PurchaseBillProduct[];
  setProducts: React.Dispatch<React.SetStateAction<PurchaseBillProduct[]>>;
  items: PurchaseBillLineItem[];
  setItems: React.Dispatch<React.SetStateAction<PurchaseBillLineItem[]>>;

  grossTotal: number;
  itemDiscountTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  discount: string;
  onDiscountChange: (value: string) => void;

  /** Validation warnings + submit/cancel actions (and, on the New Bill page, the Record Payment trigger) — rendered inside the same totals card, mirroring the invoice summary card. */
  footer: ReactNode;
}

// Shared leftCol/rightCol layout + Bill Details / Items / Totals wiring for
// the New Purchase Bill and Edit Purchase Bill pages, so the two forms can't
// drift apart. Each page still owns its own state/handlers/validation and
// supplies its own `footer` (Create vs. Save Changes, optional payment, etc.).
export function PurchaseBillFormBody({
  startIndex = 0,
  vendors, vendorId, onVendorIdChange, onVendorCreated, vendorError,
  category, onCategoryChange, billDate, onBillDateChange, dueDate, onDueDateChange,
  notes, onNotesChange, attachmentUploading, attachmentName, attachmentUrl,
  onAttachmentFileChange, onAttachmentRemove,
  products, setProducts, items, setItems,
  grossTotal, itemDiscountTotal, taxTotal, roundOff, grandTotal, discount, onDiscountChange,
  footer,
}: PurchaseBillFormBodyProps) {
  return (
    <div className={styles.layout}>
      {/* Left column */}
      <div className={styles.leftCol}>
        <BillDetailsCard
          sectionIndex={startIndex}
          vendors={vendors}
          vendorId={vendorId}
          onVendorIdChange={onVendorIdChange}
          onVendorCreated={onVendorCreated}
          vendorError={vendorError}
          category={category}
          onCategoryChange={onCategoryChange}
          billDate={billDate}
          onBillDateChange={onBillDateChange}
          dueDate={dueDate}
          onDueDateChange={onDueDateChange}
          notes={notes}
          onNotesChange={onNotesChange}
          attachmentUploading={attachmentUploading}
          attachmentName={attachmentName}
          attachmentUrl={attachmentUrl}
          onAttachmentFileChange={onAttachmentFileChange}
          onAttachmentRemove={onAttachmentRemove}
        />

        <PurchaseBillItemsTable
          sectionIndex={startIndex + 1}
          products={products}
          setProducts={setProducts}
          items={items}
          setItems={setItems}
        />
      </div>

      {/* Right column */}
      <div className={styles.rightCol}>
        <PurchaseBillTotals
          sectionIndex={startIndex + 2}
          grossTotal={grossTotal}
          itemDiscountTotal={itemDiscountTotal}
          taxTotal={taxTotal}
          roundOff={roundOff}
          grandTotal={grandTotal}
          discount={discount}
          onDiscountChange={onDiscountChange}
          footer={footer}
        />
      </div>
    </div>
  );
}
