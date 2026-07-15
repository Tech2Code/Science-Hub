"use client";

import Link from "next/link";
import styles from "./Breadcrumb.module.css";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className={styles.nav} aria-label="Breadcrumb">
      {items.map((item, i) => (
        <div key={i} className={styles.item}>
          {i > 0 && (
            <svg className={styles.sep} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          )}
          {item.href ? (
            <Link href={item.href} className={styles.link} title={item.label}>
              {item.label}
            </Link>
          ) : (
            <span className={styles.current} title={item.label}>{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
