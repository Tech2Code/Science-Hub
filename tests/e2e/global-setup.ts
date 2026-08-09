import bcrypt from "bcryptjs";
import { testPrisma, resetDb, hasTestDatabase } from "../helpers/db";

export const E2E_ADMIN_EMAIL = "e2e-admin@example.com";
export const E2E_ADMIN_PASSWORD = "Test1234!";

// Runs once before the whole E2E suite (see playwright.config.ts). Resets
// the test database to empty and seeds the one login account every spec
// authenticates as — specs create whatever else they need (customers,
// products, invoices) themselves so each spec file stays self-contained.
export default async function globalSetup() {
  if (!hasTestDatabase) {
    console.warn(
      "\n[e2e] TEST_DATABASE_URL is not set (copy .env.test.example to .env.test) — " +
      "E2E specs will run against the dev server but every login will fail since no user exists.\n"
    );
    return;
  }
  await resetDb();
  const password = await bcrypt.hash(E2E_ADMIN_PASSWORD, 10);
  await testPrisma.user.create({
    data: { name: "E2E Admin", email: E2E_ADMIN_EMAIL, password, role: "admin" },
  });
}
