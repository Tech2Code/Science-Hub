"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import styles from "../login/login.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword, resetToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to reset password.");
      } else {
        setSuccess(true);
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.grid} />
        <div className={styles.wrap}>
          <div className={styles.brand}>
            <img src="/logo.png" alt="Science Hub" className={styles.brandIcon} />
            <h1 className={styles.brandName}>Science Hub</h1>
            <p className={styles.brandSub}>Reset Password</p>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Password updated</h2>
            <p className={styles.successText}>
              Your password has been reset successfully. Sign in with your new password.
            </p>
            <Button variant="primary" size="full" href="/login">
              Back to Sign In
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid} />
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="Science Hub" className={styles.brandIcon} />
          <h1 className={styles.brandName}>Science Hub</h1>
          <p className={styles.brandSub}>Reset Password</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Reset your password</h2>
          {error && <div className={styles.errorBox}>{error}</div>}
          <form onSubmit={handleSubmit} className={styles.formStack}>
            <div>
              <label htmlFor="fp-email" className={styles.fieldLabel}>Email address</label>
              <input
                id="fp-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@sciencehub.in"
                className={styles.input}
              />
            </div>
            <div>
              <label htmlFor="fp-token" className={styles.fieldLabel}>Reset token</label>
              <PasswordInput
                id="fp-token"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                placeholder="From ADMIN_RESET_TOKEN in .env"
              />
            </div>
            <div>
              <label htmlFor="fp-pass" className={styles.fieldLabel}>New password</label>
              <PasswordInput
                id="fp-pass"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>
            <div>
              <label htmlFor="fp-confirm" className={styles.fieldLabel}>Confirm new password</label>
              <PasswordInput
                id="fp-confirm"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
              />
            </div>
            <Button type="submit" variant="primary" size="full" loading={loading} fullScreen disabled={loading}>
              {loading ? "Resetting…" : "Reset Password"}
            </Button>
          </form>
        </div>

        <div className={styles.hint}>
          <p className={styles.hintTitle}>Setup instructions</p>
          <p className={styles.resetHintText}>
            Add this line to your <code className={styles.inlineCode}>.env</code> file:
          </p>
          <code className={styles.resetHintCode}>ADMIN_RESET_TOKEN=your-secret-key</code>
        </div>

        <p className={styles.footer}>
          <Link href="/login" className={styles.forgotLink}>← Back to Sign In</Link>
        </p>
      </div>
    </div>
  );
}
