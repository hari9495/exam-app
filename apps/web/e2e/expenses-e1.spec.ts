import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Expenses batch E1 on the seeded Kaveri Foods demo, as the System Admin: copy the YukthiX starters once, see that a
// policy in force only takes new limits as a new version, then make a policy for later (each run its own name), set
// its Tier 2 hotel cap and see it saved. The rules themselves (dated versions, GSTIN, rates) run in the API e2e.

test('finance sets a Tier 2 hotel cap', async ({ browser }) => {
  test.setTimeout(180_000);
  const tag = Date.now().toString(36);
  const page = await (await browser.newContext()).newPage();
  await signIn(page, 'admin@demo-org.test', 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('admin@demo-org.test');

  await page.goto('/yx/settings/expenses');
  const starters = page.getByRole('button', { name: 'Use the starters' });
  const limitsTab = page.getByRole('tab', { name: 'Limits' });
  await expect(starters.or(limitsTab).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(limitsTab).toBeVisible({ timeout: 30_000 });

  // The starter policy is in force: its limits change only as a new version.
  await expect(page.getByRole('button', { name: 'Save as a new version' })).toBeDisabled();

  // A policy for later, for everyone: edited in place.
  await page.getByRole('button', { name: 'Copy as a new policy' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /^Name/ }).fill(`Hotels ${tag}`);
  await sheet.getByRole('radio', { name: 'Everyone' }).click();
  const later = new Date(Date.now() + 330 * 60_000 + 45 * 86_400_000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  await sheet.getByRole('textbox', { name: 'Starts on' }).fill(later);
  await sheet.getByRole('textbox', { name: 'Starts on' }).press('Tab');
  await sheet.getByRole('button', { name: 'Save policy' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole('combobox', { name: 'Policy' }).click();
  await page.getByRole('option', { name: new RegExp(`Hotels ${tag}`) }).click();
  await expect(page.getByText(/^Starts /)).toBeVisible();
  const cell = page.getByRole('textbox', { name: 'Hotel and lodging, Tier 2' });
  await cell.fill('3600');
  await page.getByRole('button', { name: 'Save limits' }).click();
  await expect(page.getByRole('button', { name: 'Save limits' })).toBeDisabled({ timeout: 30_000 });

  await page.reload();
  await page.getByRole('combobox', { name: 'Policy' }).click();
  await page.getByRole('option', { name: new RegExp(`Hotels ${tag}`) }).click();
  await expect(page.getByRole('textbox', { name: 'Hotel and lodging, Tier 2' })).toHaveValue('3600');
});
