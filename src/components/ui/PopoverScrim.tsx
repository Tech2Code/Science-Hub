"use client";

import { createPortal } from "react-dom";
import styles from "./PopoverScrim.module.css";

// Light background-dim shown behind an open topbar popover (Notifications, Global Search,
// Theme/Accent) — intercepts the click (see PopoverScrim.module.css) so the dim isn't purely
// decorative, while each popover's own existing "click outside to close" listener still fires
// correctly (this div is portaled outside every popover's own ref, so it was always "outside").
// Portaled to document.body for the same reason as Spinner's OverlayLoader/FloatingSpinner —
// an `.animate-card` ancestor's transform would otherwise trap this fixed-position layer inside
// that card's own box instead of covering the viewport.
export function PopoverScrim() {
  if (typeof document === "undefined") return null;
  return createPortal(<div className={styles.scrim} aria-hidden="true" />, document.body);
}
