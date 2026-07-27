"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Input, FormField } from "@/components/ui/Input";
import { useBranding } from "@/lib/businessBranding";
import styles from "./login.module.css";
import { rules, validate } from "@/lib/validation";

export default function LoginPage() {
  const router = useRouter();
  const { branding } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [stage, setStage] = useState<"idle" | "verifying" | "verified">("idle");

  function handleEmailBlur() {
    setEmailError(validate(email, rules.required("Email is required."), rules.email()) ?? "");
  }

  function handlePasswordBlur() {
    setPasswordError(validate(password, rules.required("Password is required.")) ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const emailErr = validate(email, rules.required("Email is required."), rules.email());
    const passwordErr = validate(password, rules.required("Password is required."));
    setEmailError(emailErr ?? "");
    setPasswordError(passwordErr ?? "");
    if (emailErr || passwordErr) return;
    setError("");
    setStage("verifying");
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setStage("idle");
      setError("Incorrect email or password. Try again.");
    } else {
      // Credentials matched — only now is a real login happening.
      setStage("verified");
      router.push("/dashboard");
    }
  }

  const loading = stage !== "idle";

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
          <form onSubmit={handleSubmit} className={styles.formStack} noValidate>
            <FormField label="Email address" error={emailError}>
              <Input
                id="email"
                type="text"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
                onBlur={handleEmailBlur}
                placeholder="you@sciencehub.in"
              />
            </FormField>
            <FormField label="Password" error={passwordError}>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); if (passwordError) setPasswordError(""); }}
                onBlur={handlePasswordBlur}
                placeholder="••••••••"
              />
            </FormField>
            <Button
              type="submit"
              variant="primary"
              size="full"
              loading={loading}
              loadingText={stage === "verified" ? "Logging in…" : "Verifying…"}
              fullScreen
              disabled={loading}
            >
              Sign in
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
