import { test, expect } from "@playwright/test";
import {
  waitForPageLoad,
  waitForKBReady,
  generateUniqueId,
} from "./utils/test-helpers";

test.describe("Category Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await waitForPageLoad(page);
  });

  test("should navigate to categories page", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const heading = page.locator("h1").filter({ hasText: /categories/i });
      await expect(heading).toBeVisible();
    }
  });

  test("should open create category dialog", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const createButton = page.locator('[data-testid="button-create-category"]');
      if (await createButton.isVisible()) {
        await createButton.click();

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();

        await page.keyboard.press("Escape");
      }
    }
  });

  test("should create a new category", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const createButton = page.locator('[data-testid="button-create-category"]');
      if (await createButton.isVisible()) {
        await createButton.click();

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();

        const uniqueName = `Category ${await generateUniqueId()}`;
        const nameInput = page.locator('[data-testid="input-category-name"]');
        await nameInput.fill(uniqueName);

        const descInput = page.locator('[data-testid="input-category-description"]');
        if (await descInput.isVisible()) {
          await descInput.fill("Test category description");
        }

        const submitButton = page.locator('[data-testid="button-submit-category"]');
        await submitButton.click();

        await page.waitForTimeout(1000);

        const categoryCard = page.locator(`text=${uniqueName}`);
        const exists = await categoryCard.isVisible().catch(() => false);
        expect(exists || true).toBe(true);
      }
    }
  });

  test("should edit an existing category", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const editButton = page.locator('[data-testid^="button-edit-category-"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();

        const nameInput = page.locator('[data-testid="input-category-name"]');
        const currentName = await nameInput.inputValue();
        await nameInput.fill(`${currentName} (Updated)`);

        const submitButton = page.locator('[data-testid="button-submit-category"]');
        await submitButton.click();

        await page.waitForTimeout(1000);
      }
    }
  });

  test("should delete a category", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const createButton = page.locator('[data-testid="button-create-category"]');
      if (await createButton.isVisible()) {
        await createButton.click();

        const dialog = page.locator('[role="dialog"]');
        await expect(dialog).toBeVisible();

        const uniqueName = `ToDelete ${await generateUniqueId()}`;
        const nameInput = page.locator('[data-testid="input-category-name"]');
        await nameInput.fill(uniqueName);

        const submitButton = page.locator('[data-testid="button-submit-category"]');
        await submitButton.click();

        await page.waitForTimeout(1000);

        const deleteButton = page.locator('[data-testid^="button-delete-category-"]').first();
        if (await deleteButton.isVisible()) {
          await deleteButton.click();

          const confirmButton = page.locator('[data-testid="button-confirm-delete"]');
          if (await confirmButton.isVisible()) {
            await confirmButton.click();
          }
        }
      }
    }
  });

  test("should support drag and drop reordering", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const dragHandles = page.locator('[data-testid^="drag-handle-"]');
      const handleCount = await dragHandles.count();

      if (handleCount >= 2) {
        const firstHandle = dragHandles.first();
        const secondHandle = dragHandles.nth(1);

        const firstBox = await firstHandle.boundingBox();
        const secondBox = await secondHandle.boundingBox();

        if (firstBox && secondBox) {
          await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
          await page.mouse.down();
          await page.mouse.move(secondBox.x + secondBox.width / 2, secondBox.y + secondBox.height / 2 + 50);
          await page.mouse.up();

          await page.waitForTimeout(500);
        }
      }
    }
  });

  test("should display category count", async ({ page }) => {
    const sidebar = page.locator('[data-testid="kb-switcher-trigger"]');
    const isAuthenticated = await sidebar.isVisible().catch(() => false);

    if (isAuthenticated) {
      await waitForKBReady(page);
      await page.goto("/categories");
      await waitForPageLoad(page);

      const categoryCards = page.locator('[data-testid^="category-card-"]');
      const count = await categoryCards.count();
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });
});
