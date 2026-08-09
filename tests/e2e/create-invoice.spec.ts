import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator("#email").fill(E2E_ADMIN_EMAIL);
  await page.locator("#password").fill(E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe("Create invoice", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // Exercises the reworked customer/product comboboxes end to end — this is
  // exactly the path the last audit found regressions in (one-off customer
  // editing, the discount % input, the Unit combobox), so this is the
  // critical-path smoke test most likely to catch the next one.
  test("creates an invoice for a newly-added customer and a one-off line item", async ({ page }) => {
    await page.goto("/sales/invoices/new");

    // Add a brand-new customer inline.
    await page.getByRole("button", { name: "+ Add new customer manually" }).click();
    const customerModal = page.getByRole("dialog");
    await customerModal.getByLabel("Customer Name").fill("Playwright Test Customer");
    await customerModal.getByLabel("Address").fill("221B Test Street");
    await customerModal.getByLabel("Pincode").fill("110001");
    // State uses this app's custom combobox (a trigger button + a listbox
    // portaled to document.body), not a native <select> — selectOption()
    // doesn't apply to it.
    await customerModal.getByLabel("State").click();
    await page.getByRole("option", { name: "Delhi", exact: true }).click();
    await customerModal.getByLabel("City").fill("New Delhi");
    await customerModal.getByRole("button", { name: /Save & Use This Customer/i }).click();
    await expect(page.getByText("Playwright Test Customer", { exact: true })).toBeVisible();

    // Add a one-off (not saved to catalog) line item.
    await page.getByRole("button", { name: "+ Add custom item manually" }).click();
    const itemModal = page.getByRole("dialog").filter({ hasText: "Add Custom Item" });
    await itemModal.getByLabel("Product Name").fill("Beaker Set");
    await itemModal.getByLabel("Unit").fill("Nos");
    await itemModal.getByLabel("Price (₹)").fill("250");
    await itemModal.getByLabel(/don't save to catalog/i).check();
    await itemModal.getByRole("button", { name: /Add to invoice/i }).click();
    await expect(page.getByText("Beaker Set", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Create Invoice" }).click();
    await expect(page).toHaveURL(/\/sales\/invoices\/[a-zA-Z0-9-]+$/);
    await expect(page.getByText("Beaker Set", { exact: true })).toBeVisible();
    await expect(page.getByText("Playwright Test Customer", { exact: true })).toBeVisible();
  });
});
