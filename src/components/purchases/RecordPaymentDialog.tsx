"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select, FormField } from "@/components/ui/Input";
import { FillMaxButton } from "@/components/ui/FillMaxButton";
import { toNum, fmtCurrency } from "@/lib/purchaseBillForm";
import styles from "./RecordPaymentDialog.module.css";

const PAYMENT_METHODS = ["Cash", "UPI", "NEFT", "RTGS", "Cheque", "Card", "Other"];

export interface PaymentDraft {
  amount: string;
  method: string;
  reference: string;
  date: string;
}

interface Props {
  open: boolean;
  billDate: string;
  grandTotal: number;
  initial: PaymentDraft;
  onCancel: () => void;
  onSave: (payment: PaymentDraft) => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function RecordPaymentDialog({ open, billDate, grandTotal, initial, onCancel, onSave }: Props) {
  const [amount, setAmount] = useState(initial.amount);
  const [method, setMethod] = useState(initial.method);
  const [reference, setReference] = useState(initial.reference);
  const [date, setDate] = useState(initial.date);
  const [fieldErrors, setFieldErrors] = useState<{ amount?: string; date?: string }>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Reset the form to the current draft whenever the dialog transitions to open.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setAmount(initial.amount);
      setMethod(initial.method);
      setReference(initial.reference);
      setDate(initial.date);
      setFieldErrors({});
    }
  }

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;

    const dialogEl = dialogRef.current;
    const focusable = dialogEl?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable && focusable.length > 0 ? focusable[0] : dialogEl)?.focus();

    return () => {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus();
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
        return;
      }
      if (e.key === "Tab") {
        const dialogEl = dialogRef.current;
        if (!dialogEl) return;
        const focusable = Array.from(
          dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const today = new Date().toISOString().slice(0, 10);

  function handleSave() {
    const amt = toNum(amount);
    if (amt <= 0) { setFieldErrors({ amount: "Enter a valid payment amount." }); return; }
    if (amt > grandTotal) { setFieldErrors({ amount: `Amount cannot exceed the bill total (₹${fmtCurrency(grandTotal)}).` }); return; }
    if (date < billDate) { setFieldErrors({ date: "Payment date cannot be before the bill date." }); return; }
    if (date > today) { setFieldErrors({ date: "Payment date cannot be in the future." }); return; }
    setFieldErrors({});
    onSave({ amount, method, reference, date });
  }

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.backdrop} onClick={onCancel} />
      <div className={styles.center}>
        <div className={styles.dialog} ref={dialogRef} tabIndex={-1}>
          <div className={styles.body}>
            <h2 className={styles.title}>Record Payment</h2>
            <p className={styles.subtitle}>Log a payment made against this bill right away.</p>

            <div className={styles.grid}>
              <FormField label="Amount (₹)" error={fieldErrors.amount}>
                <div className={styles.amountRow}>
                  <Input type="number" min="0" step="0.01" max={grandTotal} value={amount} onChange={(e) => { setAmount(e.target.value); setFieldErrors((p) => ({ ...p, amount: undefined })); }} placeholder={`Max ₹${fmtCurrency(grandTotal)}`} className={styles.amountInput} />
                  <FillMaxButton onClick={() => { setAmount(grandTotal.toFixed(2)); setFieldErrors((p) => ({ ...p, amount: undefined })); }} title="Fill full bill amount" label="Pay Full" />
                </div>
              </FormField>
              <FormField label="Payment Date" error={fieldErrors.date}>
                <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setFieldErrors((p) => ({ ...p, date: undefined })); }} min={billDate} max={today} />
              </FormField>
              <FormField label="Method">
                <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </FormField>
              <FormField label="Reference / UTR">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. cheque no., UTR…" maxLength={500} />
              </FormField>
            </div>
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            <Button variant="primary" onClick={handleSave}>Save Payment</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
