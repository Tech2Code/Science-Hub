// PDF icon for .pdf attachments, generic document icon otherwise — shown next
// to the attachment filename so it's clear the link opens a file, not just text.
export function AttachmentIcon({ name, className }: { name: string | null; className?: string }) {
  const isPdf = !!name && name.toLowerCase().endsWith(".pdf");
  if (isPdf) {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ color: "var(--c-red)", flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <text x="12" y="17" textAnchor="middle" fontSize="7" fontWeight="700" fill="currentColor" stroke="none">PDF</text>
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ color: "var(--c-text-3)", flexShrink: 0 }}>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}
