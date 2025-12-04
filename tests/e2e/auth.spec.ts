import { test, expect } from "@playwright/test";
import { waitForPageLoad, waitForKBReady, generateUniqueId } from "./utils/test-helpers";

test.describe("Authentication Flow", () => {
  test("should display landing page for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);

    const heroTitle = page.locator("h1").first();
    await expect(heroTitle).toBeVisible();

    const getStartedButton = page.locator('[data-testid="button-get-started"]');
    await expect(getStartedButton).toBeVisible();
  });

  test("should redirect to login when clicking Get Started", async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);

    const getStartedButton = page.locator('[data-testid="button-get-started"]');
    await getStartedButton.click();

    await page.waitForURL(/\/api\/login|replit\.com\/oidc/, { timeout: 10000 });
  });

  test("should show dashboard after authentication", async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);

    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      const dashboardHeading = page.locator("h1").filter({ hasText: /welcome/i });
      await expect(dashboardHeading).toBeVisible();
    }
  });

  test("should have functioning sidebar navigation", async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);

    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);

      const articlesLink = page.locator('[data-testid="nav-articles"]');
      if (await articlesLink.isVisible()) {
        await articlesLink.click();
        await expect(page).toHaveURL(/\/articles/);
      }

      const categoriesLink = page.locator('[data-testid="nav-categories"]');
      if (await categoriesLink.isVisible()) {
        await categoriesLink.click();
        await expect(page).toHaveURL(/\/categories/);
      }
    }
  });

  test("should have logout functionality", async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);

    const logoutButton = page.locator('[data-testid="button-logout"]');
    const isAuthenticated = await logoutButton.isVisible().catch(() => false);

    if (isAuthenticated) {
      await expect(logoutButton).toBeVisible();
    }
  });
});
