import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Approvals (P03) is a table: the request's row opens it in a dialog with its context, and the dialog's Approve
 * decides it. Returns the open dialog before approving when `check` is given, so a journey can assert what it shows.
 */
export async function approveRequest(page: Page, name: RegExp, check?: (open: Locator) => Promise<void>) {
  await page.goto('/yx/approvals');
  const row = page.getByRole('row', { name }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  const open = page.getByRole('dialog', { name });
  await expect(open).toBeVisible();
  if (check) await check(open);
  await open.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByRole('row', { name })).toHaveCount(0, { timeout: 30_000 });
}
