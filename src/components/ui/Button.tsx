"use client";

import { createPortal } from "react-dom";
import Link from "next/link";
import { Spinner } from "./Spinner";
import styles from "./Button.module.css";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "dangerOutline"
  | "editOutline"
  | "viewOutline"
  | "ghost"
  | "greenPrimary";

type Size = "sm" | "md" | "lg" | "full";

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  href?: string;
  loading?: boolean;
  loadingText?: string;
  success?: boolean;
  disabled?: boolean;
  fullScreen?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  type?: "button" | "submit" | "reset";
  // References a <form> by id when this button lives outside that form's DOM
  // subtree (e.g. a modal footer pinned outside the scrollable form body).
  form?: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  target?: string;
}

export function Button({
  variant = "secondary",
  size = "md",
  href,
  loading = false,
  loadingText = "Please wait…",
  success = false,
  disabled = false,
  fullScreen = false,
  onClick,
  type = "button",
  form,
  children,
  className,
  style,
  title,
  target,
}: ButtonProps) {
  const cls = [
    styles.btn,
    styles[variant],
    styles[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const overlay =
    loading && fullScreen && typeof document !== "undefined"
      ? createPortal(
          <div className={styles.overlay}>
            <div className={styles.overlayBox}>
              {success ? (
                <svg
                  className={styles.overlayCheck}
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="11" stroke="var(--c-green)" strokeWidth="2" />
                  <path
                    d="M7 12.5L10.5 16L17 8.5"
                    stroke="var(--c-green)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <div className={styles.overlayDots}>
                  <div className={styles.overlayDot} />
                  <div className={styles.overlayDot} />
                  <div className={styles.overlayDot} />
                </div>
              )}
              <span className={styles.overlayText}>{loadingText}</span>
            </div>
          </div>,
          document.body
        )
      : null;

  if (href) {
    return (
      <Link href={href} className={cls} style={style} title={title} target={target}>
        {children}
      </Link>
    );
  }

  return (
    <>
      {overlay}
      <button
        type={type}
        form={form}
        disabled={disabled || loading}
        onClick={onClick}
        className={cls}
        style={style}
        title={title}
      >
        {loading && !fullScreen && <Spinner size="sm" className={styles.inlineSpinner} />}
        {children}
      </button>
    </>
  );
}
