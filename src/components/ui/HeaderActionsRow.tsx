"use client";

import type { ReactNode } from "react";
import styles from "./HeaderActionsRow.module.css";

// Right-hand action group inside a card-header (Export/Toggle buttons, etc.) — shared
// so its layout/mobile behavior can't drift between pages that repeat this pattern.
export function HeaderActionsRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}
