import type { CSSProperties } from "react";

const STEP_MS = 80;

// Staggered fade-slide-up entrance for a page's sections; spread onto the wrapper element.
// `index` (0-based, top to bottom) each add 80ms delay so sections cascade in rather than pop in together.
export function animateSection(index: number, className?: string): { className: string; style: CSSProperties } {
  return {
    className: [className, "animate-card"].filter(Boolean).join(" "),
    style: { animationDelay: `${Math.max(index, 0) * STEP_MS}ms` },
  };
}
