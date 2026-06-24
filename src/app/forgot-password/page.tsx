"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "../login/login.module.css";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");

  function handleEmailBlur() {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
    } else {
      setEmailError("");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (emailError || !email) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
      } else {
        setSent(true);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid} />
      <div className={styles.wrap}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="Science Hub" className={styles.brandIcon} />
          <h1 className={styles.brandName}>Science Hub</h1>
          <p className={styles.brandSub}>Billing &amp; Inventory</p>
        </div>

        <div className={styles.card}>
          {sent ? (
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
                <h2 className={styles.cardTitle} style={{ marginBottom: "0.5rem" }}>Check your inbox</h2>
              </div>
              <p className={styles.successText}>
                If <strong>{email}</strong> is registered, a password reset link has been sent.
                The link expires in <strong>1 hour</strong>.
              </p>
              <p className={styles.successText} style={{ marginBottom: 0, fontSize: "0.8125rem", color: "#94a3b8" }}>
                Didn&apos;t receive it? Check your spam folder, or{" "}
                <button
                  onClick={() => setSent(false)}
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: "inherit", textDecoration: "underline" }}
                >
                  try again
                </button>
                .
              </p>
            </>
          ) : (
            <>
              <h2 className={styles.cardTitle}>Reset your password</h2>
              <p className={styles.successText}>
                Enter your account email and we&apos;ll send you a reset link.
              </p>
              {error && <div className={styles.errorBox}>{error}</div>}
              <form onSubmit={handleSubmit} className={styles.formStack} noValidate>
                <div>
                  <label htmlFor="email" className={styles.fieldLabel}>Email address</label>
                  <input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                    onBlur={handleEmailBlur}
                    placeholder="you@sciencehub.in"
                    className={styles.input}
                    style={emailError ? { borderColor: "var(--c-red, #dc2626)" } : {}}
                  />
                  {emailError && <p style={{ fontSize: "0.8rem", color: "var(--c-red, #dc2626)", marginTop: "0.25rem" }}>{emailError}</p>}
                </div>
                <button type="submit" className={styles.submitBtn} disabled={loading}>
                  {loading ? "Sending…" : "Send reset link"}
                </button>
              </form>
            </>
          )}
        </div>

        <div className={styles.forgotLinks}>
          <Link href="/find-email" className={styles.forgotLink}>Forgot email?</Link>
          <Link href="/login" className={styles.forgotLink}>← Back to sign in</Link>
        </div>

        <p className={styles.footer}>Science Hub © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
