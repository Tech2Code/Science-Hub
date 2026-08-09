import { defineConfig, devices } from "@playwright/test";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Populates process.env.TEST_DATABASE_URL for this config module, for
// tests/e2e/global-setup.ts (same Node process), and for the webServer
// command spawned below — never falls back to the app's real DATABASE_URL.
const testEnvPath = path.resolve(__dirname, ".env.test");
if (fs.existsSync(testEnvPath)) {
  dotenv.config({ path: testEnvPath });
}

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  // Every spec shares one seeded test DB — parallel workers would race on
  // the same rows. Fine at this suite's current size; revisit (worker-scoped
  // DB branches, or per-test data instead of shared fixtures) if it grows.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      ...process.env,
      ...(process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {}),
    } as Record<string, string>,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
