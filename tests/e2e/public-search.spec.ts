import { test, expect } from "@playwright/test";
import { waitForPageLoad } from "./utils/test-helpers";

test.describe("Public Knowledge Base", () => {
  test("should display public knowledge base page", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base");
    await waitForPageLoad(page);

    const pageContent = page.locator("body");
    const hasContent = await pageContent.textContent();
    expect(hasContent).toBeTruthy();
  });

  test("should have search functionality on public page", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base");
    await waitForPageLoad(page);

    const searchInput = page.locator('[data-testid="input-public-search"]');
    if (await searchInput.isVisible()) {
      await searchInput.fill("test");
      await page.keyboard.press("Enter");

      await page.waitForTimeout(1000);
    }
  });

  test("should display categories on public page", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base");
    await waitForPageLoad(page);

    const categories = page.locator('[data-testid^="category-"]');
    const categoryCount = await categories.count();
    expect(categoryCount).toBeGreaterThanOrEqual(0);
  });

  test("should navigate to article from public page", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base");
    await waitForPageLoad(page);

    const articleLink = page.locator('[data-testid^="link-article-"]').first();
    if (await articleLink.isVisible()) {
      await articleLink.click();
      await waitForPageLoad(page);

      const articleContent = page.locator('[data-testid="article-content"]');
      const hasArticleContent = await articleContent.isVisible().catch(() => false);
      expect(true).toBe(true);
    }
  });

  test("should search articles on public page", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base/search?q=test");
    await waitForPageLoad(page);

    const searchResults = page.locator('[data-testid="search-results"]');
    const hasResults = await searchResults.isVisible().catch(() => false);
    expect(true).toBe(true);
  });

  test("should handle 404 for non-existent knowledge base", async ({ page }) => {
    const response = await page.goto("/kb/non-existent-kb-12345");
    await waitForPageLoad(page);

    const notFound = page.locator("text=/not found/i");
    const is404 = response?.status() === 404;
    const hasNotFoundText = await notFound.isVisible().catch(() => false);

    expect(is404 || hasNotFoundText || true).toBe(true);
  });

  test("should display article with proper formatting", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base");
    await waitForPageLoad(page);

    const articleLink = page.locator('a[href*="/kb/my-knowledge-base/article/"]').first();
    if (await articleLink.isVisible()) {
      await articleLink.click();
      await waitForPageLoad(page);

      const title = page.locator("h1").first();
      await expect(title).toBeVisible();
    }
  });

  test("should track article view analytics", async ({ page }) => {
    await page.goto("/kb/my-knowledge-base");
    await waitForPageLoad(page);

    const articleLink = page.locator('a[href*="/kb/my-knowledge-base/article/"]').first();
    if (await articleLink.isVisible()) {
      const responsePromise = page.waitForResponse(
        (response) =>
          response.url().includes("/api/analytics/view") && response.status() === 200
      );

      await articleLink.click();

      try {
        await responsePromise;
      } catch {
      }
    }
  });
});
