"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import styles from "./login.module.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Incorrect email or password. Try again.");
    } else {
      router.push("/");
    }
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
          <h2 className={styles.cardTitle}>Sign in to your account</h2>
          {error && <div className={styles.errorBox}>{error}</div>}
          <form onSubmit={handleSubmit} className={styles.formStack}>
            <div>
              <label htmlFor="email" className={styles.fieldLabel}>Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@sciencehub.in"
                className={styles.input}
              />
            </div>
            <div>
              <label htmlFor="password" className={styles.fieldLabel}>Password</label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <Button type="submit" variant="primary" size="full" loading={loading} fullScreen disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <div className={styles.hint}>
          <p className={styles.hintTitle}>Login credentials</p>
          <div className={styles.hintRow}>
            <span className={styles.hintKey}>Email</span>
            <span>admin@sciencehub.com</span>
          </div>
          <div className={styles.hintRow}>
            <span className={styles.hintKey}>Password</span>
            <span>admin123</span>
          </div>
          <button
            type="button"
            onClick={() => { setEmail("admin@sciencehub.com"); setPassword("admin123"); }}
            className={styles.fillBtn}
          >
            Fill credentials
          </button>
        </div>

        <div className={styles.forgotRow}>
          <Link href="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
        </div>

        <p className={styles.footer}>Science Hub © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
