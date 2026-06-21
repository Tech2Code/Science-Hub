"use client";

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
}

export function Pagination({ total, page, showAll, onPage, label = "items" }: Props) {
  if (total <= PAGE_SIZE || showAll) return null;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className={styles.wrap}>
      <span className={styles.info}>{start}–{end} of {total} {label}</span>
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>
        <span className={styles.pages}>{page} / {totalPages}</span>
        <button
          className={styles.btn}
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
