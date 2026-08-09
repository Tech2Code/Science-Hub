import { test, expect } from "@playwright/test";
import { E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD } from "./global-setup";

test.describe("Login", () => {
  test("signs in with valid credentials and reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(E2E_ADMIN_EMAIL);
    await page.locator("#password").fill(E2E_ADMIN_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("shows an error on a wrong password instead of navigating away", async ({ page }) => {
    await page.goto("/login");
    await page.locator("#email").fill(E2E_ADMIN_EMAIL);
    await page.locator("#password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows inline validation without submitting when fields are blank", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/email is required/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});
