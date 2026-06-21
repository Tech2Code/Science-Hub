import styles from "./Badge.module.css";

type Variant = "paid" | "partial" | "unpaid" | "neutral" | "blue";

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

const statusMap: Record<string, Variant> = {
  paid: "paid",
  partial: "partial",
  unpaid: "unpaid",
};

export function Badge({ variant = "neutral", children, className }: BadgeProps) {
  const cls = [styles.badge, styles[variant], className].filter(Boolean).join(" ");
  return <span className={cls}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const variant = statusMap[status] ?? "neutral";
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return <Badge variant={variant}>{label}</Badge>;
}
