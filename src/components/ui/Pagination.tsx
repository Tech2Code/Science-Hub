"use client";

import { useRef } from "react";
import styles from "./Pagination.module.css";

export const PAGE_SIZE = 10;

export function usePagination<T>(items: T[], page: number, showAll: boolean) {
  const totalPages = Math.ceil(items.length / PAGE_SIZE);
  const visible = showAll
    ? items
    : items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  return { visible, totalPages };
}

interface ToggleProps {
  total: number;
  showAll: boolean;
  onToggle: () => void;
}

export function ShowAllToggle({ total, showAll, onToggle }: ToggleProps) {
  if (total <= PAGE_SIZE) return null;
  return (
    <button
      className={[styles.btn, showAll ? styles.showAllActive : styles.showAll].join(" ")}
      onClick={onToggle}
    >
      {showAll ? "Show less" : "Show all"}
    </button>
  );
}

interface Props {
  total: number;
  page: number;
  showAll: boolean;
  onPage: (p: number) => void;
  label?: string;
  loading?: boolean;
}

export function Pagination({ total, page, showAll, onPage, label = "items", loading = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  if (total <= PAGE_SIZE || showAll) return null;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  const goToPage = (p: number, e: React.MouseEvent<HTMLButtonElement>) => {
    // Blur before the button becomes `disabled` on the next render — a
    // disabled element that still has focus gets its focus yanked by the
    // browser, which can trigger its own scroll adjustment that fights
    // (and cancels) the smooth scrollIntoView below.
    e.currentTarget.blur();
    onPage(p);
    const section = wrapRef.current?.closest(".animate-card") ?? wrapRef.current;
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <span className={styles.info}>{start}–{end} of {total} {label}</span>
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={(e) => goToPage(page - 1, e)}
          disabled={page <= 1 || loading}
        >
          ← Prev
        </button>
        <span className={styles.pages}>{page} / {totalPages}</span>
        <button
          className={styles.btn}
          onClick={(e) => goToPage(page + 1, e)}
          disabled={page >= totalPages || loading}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
