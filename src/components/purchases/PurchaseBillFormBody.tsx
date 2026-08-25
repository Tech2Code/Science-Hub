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
  onVendorUpdated: (vendor: PurchaseBillVendor) => void;
  vendorError?: string;
  category: string;
  onCategoryChange: (category: string) => void;
  billDate: string;
  onBillDateChange: (date: string) => void;
  billDateError?: string;
  dueDate: string;
  onDueDateChange: (date: string) => void;
  dueDateError?: string;
  notes: string;
  onNotesChange: (notes: string) => void;
  attachmentUploading: boolean;
  attachmentName: string | null;
  attachmentUrl?: string | null;
  onAttachmentFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onAttachmentRemove: () => void;

  transportChargeEnabled: boolean;
  onToggleTransportCharge: () => void;
  transportCharge: string;
  onTransportChargeChange: (value: string) => void;
  transportChargeGstRate: string;
  onTransportChargeGstRateChange: (value: string) => void;
  transportChargeError?: string;

  products: PurchaseBillProduct[];
  setProducts: React.Dispatch<React.SetStateAction<PurchaseBillProduct[]>>;
  items: PurchaseBillLineItem[];
  setItems: React.Dispatch<React.SetStateAction<PurchaseBillLineItem[]>>;
  /** Aggregate item-level validation message (e.g. missing quantity/price) shown under the Items table. */
  itemsError?: string;

  grossTotal: number;
  itemDiscountTotal: number;
  taxTotal: number;
  transportChargeGstAmount: number;
  roundOff: number;
  grandTotal: number;
  discount: string;
  onDiscountChange: (value: string) => void;

  /** Validation warnings + submit/cancel actions (and, on the New Bill page, the Record Payment trigger) — rendered inside the same totals card, mirroring the invoice summary card. */
  footer: ReactNode;

  /** Draft-resume / first-bill numbering nudge InfoBanners — rendered as the first children of leftCol, inside the form. */
  banner?: ReactNode;
}

// Shared layout for New/Edit Purchase Bill; each page owns its own state/validation and supplies `footer`.
export function PurchaseBillFormBody({
  startIndex = 0,
  vendors, vendorId, onVendorIdChange, onVendorCreated, onVendorUpdated, vendorError,
  category, onCategoryChange, billDate, onBillDateChange, billDateError, dueDate, onDueDateChange, dueDateError,
  notes, onNotesChange, attachmentUploading, attachmentName, attachmentUrl,
  onAttachmentFileChange, onAttachmentRemove,
  transportChargeEnabled, onToggleTransportCharge, transportCharge, onTransportChargeChange,
  transportChargeGstRate, onTransportChargeGstRateChange, transportChargeError,
  products, setProducts, items, setItems, itemsError,
  grossTotal, itemDiscountTotal, taxTotal, transportChargeGstAmount, roundOff, grandTotal, discount, onDiscountChange,
  footer,
  banner,
}: PurchaseBillFormBodyProps) {
  return (
    <div className={styles.layout}>
      {/* Left column */}
      <div className={styles.leftCol}>
        {banner}
        <BillDetailsCard
          sectionIndex={startIndex}
          vendors={vendors}
          vendorId={vendorId}
          onVendorIdChange={onVendorIdChange}
          onVendorCreated={onVendorCreated}
          onVendorUpdated={onVendorUpdated}
          vendorError={vendorError}
          category={category}
          onCategoryChange={onCategoryChange}
          billDate={billDate}
          onBillDateChange={onBillDateChange}
          billDateError={billDateError}
          dueDate={dueDate}
          onDueDateChange={onDueDateChange}
          dueDateError={dueDateError}
          notes={notes}
          onNotesChange={onNotesChange}
          attachmentUploading={attachmentUploading}
          attachmentName={attachmentName}
          attachmentUrl={attachmentUrl}
          onAttachmentFileChange={onAttachmentFileChange}
          onAttachmentRemove={onAttachmentRemove}
          transportChargeEnabled={transportChargeEnabled}
          onToggleTransportCharge={onToggleTransportCharge}
          transportCharge={transportCharge}
          onTransportChargeChange={onTransportChargeChange}
          transportChargeGstRate={transportChargeGstRate}
          onTransportChargeGstRateChange={onTransportChargeGstRateChange}
          transportChargeError={transportChargeError}
        />

        <PurchaseBillItemsTable
          sectionIndex={startIndex + 1}
          products={products}
          setProducts={setProducts}
          items={items}
          setItems={setItems}
          itemsError={itemsError}
        />
      </div>

      {/* Right column */}
      <div className={styles.rightCol}>
        <PurchaseBillTotals
          sectionIndex={startIndex + 2}
          grossTotal={grossTotal}
          itemDiscountTotal={itemDiscountTotal}
          taxTotal={taxTotal}
          transportCharge={transportChargeEnabled ? parseFloat(transportCharge) || 0 : 0}
          transportChargeGstRate={transportChargeEnabled ? parseFloat(transportChargeGstRate) || 0 : 0}
          transportChargeGstAmount={transportChargeGstAmount}
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
