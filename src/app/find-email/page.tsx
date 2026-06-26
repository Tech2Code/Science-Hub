"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "../login/login.module.css";
import { rules, validate } from "@/lib/validation";

interface Result {
  name: string;
  maskedEmail: string;
  role: string;
}

export default function FindEmailPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = validate(name, rules.required("Please enter your name."), rules.minLength(2, "Name must be at least 2 characters."));
    if (nameErr) { setError(nameErr); return; }
    setError("");
    setResults(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/find-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
      } else {
        setResults(data.results);
      }
    } catch {
      setError("Network error. Please try again.");
    }
    setLoading(false);
  }

  function handleUse(maskedEmail: string) {
    // Pre-fill forgot-password with the visible part up to the first *
    // Since the email is masked, navigate to forgot-password and let user type it
    router.push(`/forgot-password?hint=${encodeURIComponent(maskedEmail)}`);
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
          <h2 className={styles.cardTitle}>Find your email</h2>
          <p className={styles.successText}>
            Enter your name as registered in the system and we&apos;ll show your account email.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} className={styles.formStack}>
            <div>
              <label htmlFor="name" className={styles.fieldLabel}>Your name</label>
              <input
                id="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => { setName(e.target.value); setResults(null); setError(""); }}
                placeholder="e.g. Gyan Singh"
                className={styles.input}
              />
            </div>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Searching…" : "Find my email"}
            </button>
          </form>

          {results !== null && (
            <div style={{ marginTop: "1.25rem", borderTop: "1px solid #e2e8f0", paddingTop: "1.25rem" }}>
              {results.length === 0 ? (
                <p style={{ fontSize: "0.875rem", color: "#64748b", textAlign: "center" }}>
                  No account found for &ldquo;{name}&rdquo;. Check the spelling and try again.
                </p>
              ) : (
                <>
                  <p style={{ fontSize: "0.8125rem", color: "#64748b", marginBottom: "0.875rem" }}>
                    {results.length} account{results.length > 1 ? "s" : ""} found:
                  </p>
                  {results.map((r, i) => (
                    <div key={i} className={styles.resultCard}>
                      <div>
                        <div className={styles.resultName}>{r.name}</div>
                        <div className={styles.resultEmail}>{r.maskedEmail}</div>
                        <div className={styles.resultRole}>{r.role}</div>
                      </div>
                      <button className={styles.useBtn} onClick={() => handleUse(r.maskedEmail)}>
                        Use this →
                      </button>
                    </div>
                  ))}
                  <p style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.75rem" }}>
                    Recognise your email? Go to{" "}
                    <Link href="/forgot-password" style={{ color: "#2563eb", textDecoration: "underline" }}>
                      Forgot password
                    </Link>{" "}
                    and enter the full address.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className={styles.forgotLinks}>
          <Link href="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
          <Link href="/login" className={styles.forgotLink}>← Back to sign in</Link>
        </div>

        <p className={styles.footer}>Science Hub © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
