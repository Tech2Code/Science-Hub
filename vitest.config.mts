import { defineConfig } from "vitest/config";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// The base .env is only read here to (a) reuse NEXTAUTH_SECRET so importing
// src/lib/auth.ts doesn't throw, and (b) as a safety check below — it is
// deliberately NOT what tests connect to.
const rootDir = import.meta.dirname;
const baseEnv = fs.existsSync(path.join(rootDir, ".env"))
  ? dotenv.parse(fs.readFileSync(path.join(rootDir, ".env")))
  : {};
const testEnvPath = path.join(rootDir, ".env.test");
const testEnv = fs.existsSync(testEnvPath) ? dotenv.parse(fs.readFileSync(testEnvPath)) : {};

// Integration tests (tests/api/**) truncate every table before each test —
// pointing them at a real/production database would be destructive. Refuse
// outright if someone points TEST_DATABASE_URL at the same database as the
// app's own DATABASE_URL, rather than silently running against it — unless
// .env.test explicitly opts in with ALLOW_SAME_DB_AS_DEV=true, an on-disk
// record that this was a deliberate, informed choice rather than a mistake.
if (
  testEnv.TEST_DATABASE_URL && baseEnv.DATABASE_URL &&
  testEnv.TEST_DATABASE_URL === baseEnv.DATABASE_URL &&
  testEnv.ALLOW_SAME_DB_AS_DEV !== "true"
) {
  throw new Error(
    "TEST_DATABASE_URL in .env.test is identical to DATABASE_URL in .env. " +
    "Integration tests truncate every table before each run — this must point at a disposable test database, never at production/dev data. " +
    "If this is intentional, add ALLOW_SAME_DB_AS_DEV=true to .env.test."
  );
}

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(rootDir, "./src") },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    // Playwright owns tests/e2e — vitest never collects those.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "tests/e2e/**"],
    // tests/api/** files all truncate every table in their own beforeEach
    // against the SAME physical test database — running test files in
    // parallel (vitest's default) means one file's resetDb() races another
    // file's still-in-flight inserts, producing FK-constraint violations,
    // Postgres deadlocks, and hung hooks. Integration tests here must run
    // one file at a time; unit tests (no DB) pay a small, harmless speed cost.
    fileParallelism: false,
    // Generous timeouts — these hit a real remote Postgres (Neon) over the
    // network per query, not an in-memory mock; the Vitest defaults (5s test
    // / 10s hook) are tuned for local/mocked tests and were too tight here.
    // Neon's serverless compute occasionally stalls for tens of seconds on a
    // cold start after being idle — 60s on the hook timeout (resetDb() is
    // where this has been observed) gives that room without masking a truly
    // hung test.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: "test",
      NEXTAUTH_SECRET: baseEnv.NEXTAUTH_SECRET || "test-only-secret-not-for-production-use-32chars",
      // Only ever set from .env.test — never falls back to the real DATABASE_URL.
      // Left undefined (not proxied to the real DB) when .env.test doesn't
      // exist yet, so API/integration tests can detect this and skip
      // themselves instead of accidentally hitting a real database.
      ...(testEnv.TEST_DATABASE_URL
        ? { TEST_DATABASE_URL: testEnv.TEST_DATABASE_URL, DATABASE_URL: testEnv.TEST_DATABASE_URL }
        : {}),
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**", "src/app/api/**"],
    },
  },
});
