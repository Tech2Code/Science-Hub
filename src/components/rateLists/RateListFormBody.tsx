"use client";

import type { ReactNode } from "react";
import { Input, Textarea, FormField } from "@/components/ui/Input";
import { animateSection } from "@/lib/animateSection";
import { RateListItemsTable } from "@/components/rateLists/RateListItemsTable";
import type { RateListLineItem } from "@/lib/rateListForm";
import styles from "./RateListFormBody.module.css";

interface RateListFormBodyProps {
  /** Section-index the leftCol's Details card starts at — lets a page with content above this keep its stagger animation sequential. */
  startIndex?: number;

  title: string;
  onTitleChange: (title: string) => void;
  titleError?: string;
  note: string;
  onNoteChange: (note: string) => void;

  items: RateListLineItem[];
  setItems: React.Dispatch<React.SetStateAction<RateListLineItem[]>>;
  itemsError?: string;

  /** Validation warnings + submit/cancel actions — rendered inside the same summary card, mirroring the purchase-bill totals card. */
  footer: ReactNode;

  /** Draft-resume InfoBanner — rendered as the first child of leftCol, inside the form. */
  banner?: ReactNode;
}

// Shared layout for New/Edit Rate List pages so the two forms can't drift apart — mirrors PurchaseBillFormBody.
export function RateListFormBody({
  startIndex = 0,
  title, onTitleChange, titleError,
  note, onNoteChange,
  items, setItems, itemsError,
  footer,
  banner,
}: RateListFormBodyProps) {
  const itemCount = items.filter((i) => i.name.trim()).length;

  return (
    <div className={styles.layout}>
      {/* Left column */}
      <div className={styles.leftCol}>
        {banner}
        <div {...animateSection(startIndex, "form-card")}>
          <h2 className="form-section-title">Details</h2>
          <div className="form-grid-2">
            <FormField label="Title" required error={titleError}>
              <Input
                type="text" placeholder="e.g. Chemical Rate List"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                maxLength={200}
              />
            </FormField>
          </div>
          <FormField label="Note" hint='Optional — printed below the title, e.g. "GST Extra as Applicable"'>
            <Textarea rows={2} value={note} onChange={(e) => onNoteChange(e.target.value)} placeholder="GST Extra as Applicable" maxLength={2000} />
          </FormField>
        </div>

        <RateListItemsTable sectionIndex={startIndex + 1} items={items} setItems={setItems} />
      </div>

      {/* Right column */}
      <div className={styles.rightCol}>
        <div {...animateSection(startIndex + 2, "form-card")}>
          <h2 className="form-section-title">Summary</h2>
          <div className={styles.summaryLine}>
            <span>Items</span><span>{itemCount}</span>
          </div>
          {itemsError && <p className={styles.itemsErrorMsg} role="alert">{itemsError}</p>}
          {footer}
        </div>
      </div>
    </div>
  );
}
