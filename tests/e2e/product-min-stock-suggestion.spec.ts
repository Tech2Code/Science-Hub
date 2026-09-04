import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator("#email").fill(E2E_ADMIN_EMAIL);
  await page.locator("#password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("New Product — unit-aware Minimum Stock suggestion", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // suggestMinStockForUnit() (src/lib/productForm.ts) drives an auto-suggested Minimum
  // Stock that re-derives on every Unit change — until the user edits Minimum Stock
  // themselves, at which point the New Product page (src/app/(dashboard)/products/new/page.tsx)
  // must stop overwriting it. This exercises both halves: the suggestion actually updating,
  // and it actually stopping once overridden — plus that the override survives a real save.
  test("suggests Minimum Stock from the unit, then stops once the user overrides it", async ({ page }) => {
    const productName = `Min Stock Test ${Date.now()}`;

    await page.goto("/products/new");

    await page.getByLabel("Product Name").fill(productName);
    await page.getByLabel("List Price (₹)").fill("100");

    const unitField = page.getByLabel("Unit");
    const minStockField = page.getByLabel("Minimum Stock");

    // Kg -> a bulk container unit -> 3
    await unitField.fill("Kg");
    await expect(minStockField).toHaveValue("3");

    // 250g -> not a recognized bulk/loose/container unit on its own -> falls back to the plain default, 10
    await unitField.fill("250g");
    await expect(minStockField).toHaveValue("10");

    // g -> loose/bulk unit -> 500
    await unitField.fill("g");
    await expect(minStockField).toHaveValue("500");

    // User now types a value directly into Minimum Stock — this must flip the form's
    // internal "still auto-suggested" flag off.
    await minStockField.fill("7");
    await expect(minStockField).toHaveValue("7");

    // Changing the unit again (Ltr would otherwise suggest 3) must NOT touch the
    // manually-entered value anymore.
    await unitField.fill("Ltr");
    await expect(minStockField).toHaveValue("7");

    await page.getByRole("button", { name: "Save Product" }).click();

    // Excludes "new" — the form page itself is at /products/new, which would
    // otherwise satisfy a bare [a-zA-Z0-9-]+ pattern with no actual navigation.
    await expect(page).toHaveURL(/\/products\/(?!new$)[a-zA-Z0-9-]+$/);
    // The name also appears in the breadcrumb, so target the page heading specifically
    // to avoid a strict-mode multi-match.
    await expect(page.getByRole("heading", { name: productName })).toBeVisible();
    // Opening Stock defaults to 0, so the product is "below min" against the manually
    // overridden minStock=7 — confirms 7 (not the last auto-suggested 3) was actually saved.
    await expect(page.getByText("Below min (7)")).toBeVisible();
  });
});
