"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useBranding } from "@/lib/businessBranding";
import { Input, FormField } from "@/components/ui/Input";
import styles from "../login/login.module.css";
import pageStyles from "./findEmail.module.css";
import { rules, validate } from "@/lib/validation";

interface Result {
  name: string;
  maskedEmail: string;
}

export default function FindEmailPage() {
  const router = useRouter();
  const { branding } = useBranding();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState("");
  const [nameError, setNameError] = useState("");

  function handleNameBlur() {
    const err = validate(name, rules.required("Please enter your name."), rules.minLength(2, "Name must be at least 2 characters."));
    setNameError(err ?? "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const nameErr = validate(name, rules.required("Please enter your name."), rules.minLength(2, "Name must be at least 2 characters."));
    if (nameErr) { setNameError(nameErr); return; }
    setError("");
    setNameError("");
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
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic uploaded business logo, not a static asset */}
          <img src={branding.logoUrl || "/logo.png"} alt="Logo" width={56} height={56} className={styles.brandIcon} />
          <h1 className={styles.brandName}>{branding.name}</h1>
          <p className={styles.brandSub}>{branding.tagline || "Billing & Inventory"}</p>
        </div>

        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Find your email</h2>
          <p className={styles.successText}>
            Enter your name as registered in the system and we&apos;ll show your account email.
          </p>

          {error && <div className={styles.errorBox}>{error}</div>}

          <form onSubmit={handleSubmit} className={styles.formStack} noValidate>
            <FormField label="Your name" error={nameError}>
              <Input
                id="name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => { setName(e.target.value); setResults(null); if (nameError) setNameError(""); }}
                onBlur={handleNameBlur}
                placeholder="e.g. Enter Your Name"
              />
            </FormField>
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? "Searching…" : "Find my email"}
            </button>
          </form>

          {results !== null && (
            <div className={pageStyles.resultsWrap}>
              {results.length === 0 ? (
                <p className={pageStyles.noResults}>
                  No account found for &ldquo;{name}&rdquo;. Check the spelling and try again.
                </p>
              ) : (
                <>
                  <p className={pageStyles.resultsCount}>
                    {results.length} account{results.length > 1 ? "s" : ""} found:
                  </p>
                  {results.map((r, i) => (
                    <div key={i} className={styles.resultCard}>
                      <div className={pageStyles.resultInfo}>
                        <div className={styles.resultName}>{r.name}</div>
                        <div className={styles.resultEmail}>{r.maskedEmail}</div>
                      </div>
                      <button className={styles.useBtn} onClick={() => handleUse(r.maskedEmail)}>
                        Use this →
                      </button>
                    </div>
                  ))}
                  <p className={pageStyles.recogniseText}>
                    Recognise your email? Go to{" "}
                    <Link href="/forgot-password" className={pageStyles.recogniseLink}>
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
