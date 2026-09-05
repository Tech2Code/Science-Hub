// Shared "→" replacement — same arrow used on the Dashboard's primary action tiles
// (see actionTileArrow in src/app/(dashboard)/dashboard/page.tsx), so every "View all"/
// "Create one"/"View Products" style link renders the same arrow instead of a mix of
// plain "→" text characters and this SVG.
export function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg
      width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={className}
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
