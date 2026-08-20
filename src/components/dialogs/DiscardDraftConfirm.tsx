"use client";

import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirms before permanently deleting a saved form draft — shared by every
// page's "Resume draft?" banner (New/Edit Product, Invoice, Purchase Bill,
// Rate List, Customer, Vendor, and the Products bulk-import modal) so one
// misclick on the banner's × can't silently wipe unsaved work that was only
// ever sitting in localStorage.
export function DiscardDraftConfirm({ open, onConfirm, onCancel }: Props) {
  return (
    <ConfirmDialog
      open={open}
      title="Discard saved draft?"
      message="This permanently deletes the saved draft. You'll need to re-enter this information next time."
      confirmLabel="Discard"
      variant="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
