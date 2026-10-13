import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Recruitment batch AT1 on the seeded demo (founder D1): the older jobs list redirects to Hiring › Jobs; a new job is
// created there and opens in its existing workspace.

test('the jobs list moved to Hiring › Jobs: redirect, create, open', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'admin@demo-org.test', 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await page.goto('/v2/jobs');
  await page.waitForURL(/\/yx\/hiring\/jobs$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Jobs', level: 1 })).toBeVisible({ timeout: 30_000 });
  const title = `Stores assistant ${Date.now().toString(36)}`;
  await page.getByRole('button', { name: 'New job' }).click();
  const d = page.getByRole('dialog');
  await d.getByRole('textbox', { name: /Job title/ }).fill(title);
  await d.getByRole('button', { name: 'Create' }).click();
  await expect(d).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole('textbox', { name: 'Search jobs' }).fill(title);
  const row = page.getByRole('row', { name: new RegExp(title) });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByRole('button', { name: 'Open' }).click();
  await page.waitForURL(/\/v2\/jobs\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 30_000 });
});
