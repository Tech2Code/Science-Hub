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
  disabled?: boolean;
  fullScreen?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  type?: "button" | "submit" | "reset";
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
  disabled = false,
  fullScreen = false,
  onClick,
  type = "button",
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
              <div className={styles.overlayDots}>
                <div className={styles.overlayDot} />
                <div className={styles.overlayDot} />
                <div className={styles.overlayDot} />
              </div>
              <span className={styles.overlayText}>Please wait…</span>
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
        disabled={disabled || loading}
        onClick={onClick}
        className={cls}
        style={style}
        title={title}
      >
        {loading && !fullScreen && <Spinner size="sm" />}
        {children}
      </button>
    </>
  );
}
