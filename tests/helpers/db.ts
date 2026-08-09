import { PrismaClient } from "@prisma/client";

// TEST_DATABASE_URL is only ever populated (see vitest.config.ts) when
// .env.test exists — never falls back to the app's real DATABASE_URL. When
// it's absent, this client intentionally points at an unreachable host so
// any accidental use fails loudly with a connection error instead of
// silently touching a real database.
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

export const hasTestDatabase = !!testDatabaseUrl;

export const testPrisma = new PrismaClient({
  datasources: { db: { url: testDatabaseUrl ?? "postgresql://unconfigured-test-db@localhost:5432/unconfigured" } },
});

// Deletes every row from every table, in FK-safe order (children before
// parents — same dependency ordering /api/bin/empty already uses), so each
// integration test starts from a known-empty database. Call from a
// `beforeEach` in any test file under tests/api/**.
export async function resetDb() {
  await testPrisma.$transaction([
    testPrisma.stockMovement.deleteMany(),
    testPrisma.returnItem.deleteMany(),
    testPrisma.return.deleteMany(),
    testPrisma.payment.deleteMany(),
    testPrisma.invoiceItem.deleteMany(),
    testPrisma.invoice.deleteMany(),
    testPrisma.purchasePayment.deleteMany(),
    testPrisma.purchaseBillItem.deleteMany(),
    testPrisma.purchaseBill.deleteMany(),
    testPrisma.product.deleteMany(),
    testPrisma.brand.deleteMany(),
    testPrisma.category.deleteMany(),
    testPrisma.customer.deleteMany(),
    testPrisma.vendor.deleteMany(),
    testPrisma.activityLog.deleteMany(),
    testPrisma.sectionPermission.deleteMany(),
    testPrisma.passwordResetToken.deleteMany(),
    testPrisma.user.deleteMany(),
    testPrisma.businessSettings.deleteMany(),
  ]);
}

// A route handler test needs a real User row to log activity against
// (logActivity() writes userId as a hard FK, and it's wrapped in try/catch
// so a violation there would otherwise fail silently rather than failing
// the test clearly) — this creates one and returns its id.
export async function seedUser(overrides: Partial<{ name: string; email: string; role: string }> = {}) {
  return testPrisma.user.create({
    data: {
      name: overrides.name ?? "Test User",
      email: overrides.email ?? `test-${Math.random().toString(36).slice(2)}@example.com`,
      password: "unused-in-tests",
      role: overrides.role ?? "staff",
    },
  });
}
