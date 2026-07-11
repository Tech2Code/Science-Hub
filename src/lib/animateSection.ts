import type { CSSProperties } from "react";

const STEP_MS = 80;

/**
 * Staggered fade-slide-up entrance for a page's top-level sections (cards,
 * grids, tables) — the same effect used on the Dashboard. Spread the result
 * onto the section's wrapper element, alongside whatever className it
 * already has:
 *
 *   <div {...animateSection(0, `card ${styles.sectionCard}`)}>
 *   <div {...animateSection(1, styles.kpiRow)}>
 *
 * `index` is the section's position on the page (0-based, top to bottom) —
 * each step adds 80ms of delay so sections cascade in one after another
 * instead of popping in together. There's no fixed limit on index, so pages
 * with many sections just keep incrementing.
 */
export function animateSection(index: number, className?: string): { className: string; style: CSSProperties } {
  return {
    className: [className, "animate-card"].filter(Boolean).join(" "),
    style: { animationDelay: `${Math.max(index, 0) * STEP_MS}ms` },
  };
}
