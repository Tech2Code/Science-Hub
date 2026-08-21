"use client";

import { ConfirmDialog } from "./ConfirmDialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Confirms before permanently deleting a saved form draft, shared across every "Resume draft?" banner, so a misclick can't silently wipe unsaved localStorage work.
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
