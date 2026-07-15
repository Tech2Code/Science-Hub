"use client";

import { Sk } from "@/components/ui/Skeleton";
import { animateSection } from "@/lib/animateSection";
import styles from "./StatCardsRow.module.css";

export type StatCardTone = "default" | "positive" | "warning" | "muted" | "danger";

const TONE_CLASS: Record<StatCardTone, string> = {
  default: styles.toneDefault,
  positive: styles.tonePositive,
  warning: styles.toneWarning,
  muted: styles.toneMuted,
  danger: styles.toneDanger,
};

export interface StatCard {
  label: string;
  value: string;
  tone?: StatCardTone;
}

interface StatCardsRowProps {
  sectionIndex: number;
  cards: StatCard[];
  /** Show a pulsing placeholder instead of each card's value while the underlying data is still loading. */
  loading?: boolean;
}

// Summary stat cards (Total/Paid/Pending/Overdue-style) shown atop list pages —
// shared by the Invoices and Purchase Bills list pages so they can't drift apart.
export function StatCardsRow({ sectionIndex, cards, loading }: StatCardsRowProps) {
  return (
    <div {...animateSection(sectionIndex, styles.statsGrid)}>
      {cards.map((card) => (
        <div key={card.label} className={`card ${styles.statCard}`}>
          <div className={styles.statLabel}>{card.label}</div>
          {loading ? (
            <Sk w={72} h={20} />
          ) : (
            <div className={`${styles.statValue} ${TONE_CLASS[card.tone ?? "default"]}`}>{card.value}</div>
          )}
        </div>
      ))}
    </div>
  );
}
