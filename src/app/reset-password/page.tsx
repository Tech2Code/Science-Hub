"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PasswordInput } from "@/components/ui/PasswordInput";
import styles from "../login/login.module.css";
import { rules, validate } from "@/lib/validation";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) setError("Invalid reset link. Please request a new one.");
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const pwErr   = validate(password, rules.required("Password is required."), rules.minLength(6, "Password must be at least 6 characters."));
    const confErr = validate(confirm,  rules.required("Please confirm your password."), rules.passwordMatch(password));
    if (pwErr || confErr) { setError(pwErr ?? confErr ?? ""); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setDone(true);
        setTimeout(() => router.push("/login"), 3000);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className={styles.card}>
      {done ? (
        <>
          <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "#dcfce7", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 1rem",
            }}>
              <svg width="24" height="24" fill="none" stroke="#16a34a" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <h2 className={styles.cardTitle} style={{ marginBottom: "0.5rem" }}>Password updated</h2>
          </div>
          <p className={styles.successText}>
            Your password has been reset successfully. Redirecting you to sign in…
          </p>
        </>
      ) : (
        <>
          <h2 className={styles.cardTitle}>Set a new password</h2>
          {error && <div className={styles.errorBox}>{error}</div>}
          {!token ? null : (
            <form onSubmit={handleSubmit} className={styles.formStack}>
              <div>
                <label htmlFor="password" className={styles.fieldLabel}>New password</label>
                <PasswordInput
                  id="password"
                  autoComplete="new-password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="min. 6 characters"
                />
              </div>
              <div>
                <label htmlFor="confirm" className={styles.fieldLabel}>Confirm new password</label>
                <PasswordInput
                  id="confirm"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="repeat your new password"
                />
              </div>
              <button type="submit" className={styles.submitBtn} disabled={loading || !token}>
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className={styles.page}>
      <div className={styles.grid} />
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="Science Hub" className={styles.brandIcon} />
          <h1 className={styles.brandName}>Science Hub</h1>
          <p className={styles.brandSub}>Billing &amp; Inventory</p>
        </div>

        <Suspense fallback={<div className={styles.card}><p className={styles.successText}>Loading…</p></div>}>
          <ResetPasswordForm />
        </Suspense>

        <div className={styles.forgotRow}>
          <Link href="/login" className={styles.forgotLink}>← Back to sign in</Link>
        </div>

        <p className={styles.footer}>Science Hub © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
