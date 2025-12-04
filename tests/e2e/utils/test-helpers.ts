import { Page, expect } from "@playwright/test";

export async function generateUniqueId(): Promise<string> {
  return `test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}

export async function expectToast(page: Page, text: string): Promise<void> {
  const toast = page.locator('[role="status"]').filter({ hasText: text });
  await expect(toast).toBeVisible({ timeout: 10000 });
}

export async function closeDialogIfOpen(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]');
  if (await dialog.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden({ timeout: 5000 });
  }
}

export async function waitForKBReady(page: Page): Promise<void> {
  await page.waitForSelector('[data-testid="kb-switcher-trigger"]', {
    state: "visible",
    timeout: 15000,
  });
  const switcher = page.locator('[data-testid="kb-switcher-trigger"]');
  await expect(switcher).not.toContainText("No knowledge base", { timeout: 10000 });
}

export async function navigateToPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForPageLoad(page);
}

export async function fillAndSubmitForm(
  page: Page,
  fields: Record<string, string>,
  submitTestId: string
): Promise<void> {
  for (const [testId, value] of Object.entries(fields)) {
    const input = page.locator(`[data-testid="${testId}"]`);
    await input.fill(value);
  }
  await page.locator(`[data-testid="${submitTestId}"]`).click();
}
