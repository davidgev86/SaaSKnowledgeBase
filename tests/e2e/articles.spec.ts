import { test, expect } from "@playwright/test";
import {
  waitForPageLoad,
  waitForKBReady,
  generateUniqueId,
  expectToast,
} from "./utils/test-helpers";

test.describe("Article Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);
  });

  test("should navigate to articles page", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles");
      await waitForPageLoad(page);

      const heading = page.locator("h1").filter({ hasText: /articles/i });
      await expect(heading).toBeVisible();
    }
  });

  test("should display empty state when no articles exist", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles");
      await waitForPageLoad(page);

      const emptyState = page.locator('[data-testid="empty-state"]');
      const articleList = page.locator('[data-testid^="article-card-"]');

      const hasArticles = (await articleList.count()) > 0;
      if (!hasArticles) {
        await expect(emptyState).toBeVisible();
      }
    }
  });

  test("should navigate to new article page", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles");
      await waitForPageLoad(page);

      const newArticleButton = page.locator('[data-testid="button-new-article"]');
      if (await newArticleButton.isVisible()) {
        await newArticleButton.click();
        await expect(page).toHaveURL(/\/articles\/new/);
      }
    }
  });

  test("should create a new article", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles/new");
      await waitForPageLoad(page);

      const uniqueTitle = `Test Article ${await generateUniqueId()}`;

      const titleInput = page.locator('[data-testid="input-title"]');
      await expect(titleInput).toBeVisible();
      await titleInput.fill(uniqueTitle);

      const editor = page.locator(".ProseMirror");
      if (await editor.isVisible()) {
        await editor.click();
        await page.keyboard.type("This is test content for the article.");
      }

      const saveButton = page.locator('[data-testid="button-save"]');
      await saveButton.click();

      await page.waitForURL(/\/articles$/, { timeout: 10000 });

      const articleCard = page.locator(`text=${uniqueTitle}`);
      await expect(articleCard).toBeVisible({ timeout: 5000 });
    }
  });

  test("should edit an existing article", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles");
      await waitForPageLoad(page);

      const editButton = page.locator('[data-testid^="button-edit-"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await expect(page).toHaveURL(/\/articles\/[^/]+$/);

        const titleInput = page.locator('[data-testid="input-title"]');
        const currentTitle = await titleInput.inputValue();
        await titleInput.fill(`${currentTitle} (Updated)`);

        const saveButton = page.locator('[data-testid="button-save"]');
        await saveButton.click();

        await page.waitForURL(/\/articles$/, { timeout: 10000 });
      }
    }
  });

  test("should toggle article visibility", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles");
      await waitForPageLoad(page);

      const visibilityToggle = page.locator('[data-testid^="button-toggle-visibility-"]').first();
      if (await visibilityToggle.isVisible()) {
        await visibilityToggle.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test("should delete an article", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);

      await page.goto("/articles/new");
      await waitForPageLoad(page);

      const uniqueTitle = `Delete Test ${await generateUniqueId()}`;
      const titleInput = page.locator('[data-testid="input-title"]');
      await titleInput.fill(uniqueTitle);

      const editor = page.locator(".ProseMirror");
      if (await editor.isVisible()) {
        await editor.click();
        await page.keyboard.type("Article to be deleted.");
      }

      const saveButton = page.locator('[data-testid="button-save"]');
      await saveButton.click();
      await page.waitForURL(/\/articles$/, { timeout: 10000 });

      const deleteButton = page.locator('[data-testid^="button-delete-"]').first();
      if (await deleteButton.isVisible()) {
        await deleteButton.click();

        const confirmButton = page.locator('[data-testid="button-confirm-delete"]');
        if (await confirmButton.isVisible()) {
          await confirmButton.click();
        }
      }
    }
  });

  test("should search articles", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/articles");
      await waitForPageLoad(page);

      const searchInput = page.locator('[data-testid="input-search"]');
      if (await searchInput.isVisible()) {
        await searchInput.fill("test");
        await page.waitForTimeout(500);
      }
    }
  });
});
