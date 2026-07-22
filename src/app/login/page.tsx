"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Input } from "@/components/ui/Input";
import { useBranding } from "@/lib/businessBranding";
import styles from "./login.module.css";
import { rules, validate } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validate(email, rules.required("Email is required."), rules.email());
    const passwordErr = validate(password, rules.required("Password is required."));
    const err = emailErr || passwordErr;
    if (err) { setError(err); return; }
    setError("");
    setLoading(true);
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Incorrect email or password. Try again.");
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid} />
      <div className={styles.wrap}>
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded business logo, not a static asset */}
          <img src={branding.logoUrl || "/logo.png"} alt="Logo" width={56} height={56} className={styles.brandIcon} />
          <h1 className={styles.brandName}>{branding.name}</h1>
          <p className={styles.brandSub}>{branding.tagline || "Billing & Inventory"}</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Sign in to your account</h2>
          {error && <div className={styles.errorBox}>{error}</div>}
          <form onSubmit={handleSubmit} className={styles.formStack}>
            <div>
              <label htmlFor="email" className={styles.fieldLabel}>Email address</label>
              <Input
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
            <Button type="submit" variant="primary" size="full" loading={loading} loadingText="Logging in…" fullScreen disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>

        <div className={styles.forgotLinks}>
          <Link href="/forgot-password" className={styles.forgotLink}>Forgot password?</Link>
          <Link href="/find-email" className={styles.forgotLink}>Forgot email?</Link>
        </div>

        <p className={styles.footer}>Science Hub © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
