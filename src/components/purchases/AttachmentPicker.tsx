"use client";

import { Spinner } from "@/components/ui/Spinner";
import { truncateFilename } from "@/lib/truncateFilename";
import { AttachmentIcon } from "./AttachmentIcon";
import styles from "./AttachmentPicker.module.css";

interface AttachmentPickerProps {
  uploading: boolean;
  name: string | null;
  /** When set, the attached file's name renders as a link to this URL (edit page); omit to render plain text (new page, nothing saved yet). */
  url?: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  accept?: string;
  typeHint?: string;
}

// Bill attachment (upload / uploaded-state / remove) — shared by the New
// Purchase Bill and Edit Purchase Bill pages so the two forms can't drift apart.
export function AttachmentPicker({
  uploading, name, url, onFileChange, onRemove,
  accept = "application/pdf,image/*",
  typeHint = "Accepted: PDF, JPG, PNG, WEBP, HEIC • Max 10 MB",
}: AttachmentPickerProps) {
  if (uploading) {
    return (
      <span className={styles.attachmentUploading}>
        <Spinner size="sm" className={styles.attachmentUploadingSpinner} />
        Uploading…
      </span>
    );
  }
  if (name) {
    return (
      <div className={styles.attachmentRow}>
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" title={name} className={styles.attachmentLink}>
            <AttachmentIcon name={name} />
            {truncateFilename(name)}
          </a>
        ) : (
          <span className={styles.attachmentName} title={name}>
            <AttachmentIcon name={name} />
            {truncateFilename(name)}
          </span>
        )}
        <button type="button" onClick={onRemove} className={styles.attachmentRemoveBtn}>Remove</button>
      </div>
    );
  }
  return (
    <div>
      <label className={styles.attachmentPicker}>
        <span className={styles.attachmentPickerBtn}>Choose File</span>
        <span className={styles.attachmentPickerHint}>No file chosen</span>
        <input type="file" accept={accept} onChange={onFileChange} className={styles.attachmentPickerInput} />
      </label>
      <div className={styles.attachmentTypeHint}>{typeHint}</div>
    </div>
  );
}
