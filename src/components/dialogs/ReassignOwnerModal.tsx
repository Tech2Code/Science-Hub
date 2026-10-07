"use client";

import { useCallback, useEffect, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "@/components/ui/Button";
import { Select, FormField } from "@/components/ui/Input";

interface UserOption {
  id: string;
  name: string;
  role: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  // e.g. "Invoice", "Purchase Bill", "Rate List" — used in the modal title and error copy only.
  entityLabel: string;
  // e.g. the invoice/bill number or rate list title, shown as the modal subtitle for context.
  documentLabel?: string;
  currentUserId: string;
  currentUserName: string;
  saving: boolean;
  onSave: (targetUserId: string) => void;
}

// Shared by the Invoice/Purchase Bill/Rate List detail pages' admin-only "Reassign" action —
// only changes who is recorded as the document's creator, nothing else about the document.
// Fetches the user list itself (admin-only /api/admin/users) since it's only ever rendered for
// an admin viewer to begin with.
export function ReassignOwnerModal({ open, onClose, entityLabel, documentLabel, currentUserId, currentUserName, saving, onSave }: Props) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState(currentUserId);

  const loadUsers = useCallback(() => {
    setLoadingUsers(true);
    setLoadError(false);
    fetch("/api/admin/users", { headers: { "x-no-loader": "1" } })
      .then(async (r) => {
        const data = await r.json().catch(() => null);
        // A failed response (403/500) must not silently render as an empty picker.
        if (!r.ok || !Array.isArray(data)) throw new Error("load failed");
        setUsers(data);
      })
      .catch(() => { setUsers([]); setLoadError(true); })
      .finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset-on-open, not a derived-state sync
    setSelectedId(currentUserId);
    loadUsers();
  }, [open, currentUserId, loadUsers]);

  const unchanged = selectedId === currentUserId;
  // Managers are read-only and can't create documents in normal use — excluded as a reassign
  // target so the picker doesn't offer a role that couldn't have created this document itself.
  // The current creator still always appears even if they were later demoted to manager, so the
  // picker never hides the document's actual existing state.
  const selectableUsers = users.filter((u) => u.role !== "manager" || u.id === currentUserId);

  return (
    <Modal
      open={open}
      title={`Reassign ${entityLabel}`}
      subtitle={documentLabel}
      onClose={() => { if (!saving) onClose(); }}
      variant="fullscreen"
      maxWidth="26rem"
      footer={
        <>
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="primary"
            loading={saving}
            disabled={saving || loadingUsers || loadError || unchanged || !selectedId}
            onClick={() => onSave(selectedId)}
          >
            Reassign
          </Button>
        </>
      }
    >
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--c-text-2)" }}>
        Currently created by <strong>{currentUserName}</strong>. This only changes who is recorded as the creator — no other data on this {entityLabel.toLowerCase()} changes.
      </p>
      {loadError && !loadingUsers ? (
        <div role="alert" style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "0.875rem", color: "var(--c-red)" }}>
          <span>Couldn&apos;t load users.</span>
          <Button type="button" variant="secondary" size="sm" onClick={loadUsers}>Retry</Button>
        </div>
      ) : (
      <FormField label="Reassign to">
        <Select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loadingUsers || saving}>
          {loadingUsers && <option value={currentUserId}>Loading users…</option>}
          {!loadingUsers && selectableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role}){u.id === currentUserId ? " — current" : ""}
            </option>
          ))}
        </Select>
      </FormField>
      )}
    </Modal>
  );
}
