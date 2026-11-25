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

  // The starter policy is in force: a changed limit is saved only as a new version (then left unsaved here).
  const matrix = page.getByRole('tabpanel', { name: 'Limits matrix' });
  await expect(matrix).toContainText(/v\d+, from .+Standard: everyone/);
  await matrix.getByRole('textbox', { name: 'Hotel and lodging, Tier 2' }).fill('3333');
  await expect(matrix.getByRole('button', { name: /^Save as v\d+$/ })).toBeVisible();
  await expect(matrix.getByRole('button', { name: 'Save limits' })).toHaveCount(0);
  await matrix.getByRole('button', { name: 'Discard' }).click();

  // A policy for later, for everyone: edited in place.
  await page.getByRole('button', { name: 'Copy as a new policy' }).click();
  const sheet = page.getByRole('dialog', { name: 'Copy as a new policy' });
  await sheet.getByRole('textbox', { name: /^Name/ }).fill(`Hotels ${tag}`);
  await sheet.getByRole('radio', { name: 'Everyone' }).click();
  const later = new Date(Date.now() + 330 * 60_000 + 45 * 86_400_000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  await sheet.getByRole('textbox', { name: 'Starts on' }).fill(later);
  await sheet.getByRole('textbox', { name: 'Starts on' }).press('Tab');
  await sheet.getByRole('button', { name: 'Save policy' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });

  const open = async () => {
    await page.getByRole('table', { name: 'Other policies' }).getByRole('row', { name: new RegExp(`Hotels ${tag}`) }).getByRole('button', { name: 'Edit limits' }).click();
    await expect(matrix).toContainText(new RegExp(`v[0-9]+, starts .+Hotels ${tag}: everyone`), { timeout: 30_000 });
  };
  await open();
  await matrix.getByRole('textbox', { name: 'Hotel and lodging, Tier 2' }).fill('3600');
  await matrix.getByRole('button', { name: 'Save limits' }).click();
  await expect(matrix.getByRole('button', { name: 'Save limits' })).toHaveCount(0, { timeout: 30_000 }); // nothing left unsaved

  await page.reload();
  await open();
  await expect(matrix.getByRole('textbox', { name: 'Hotel and lodging, Tier 2' })).toHaveValue('3600');
});
