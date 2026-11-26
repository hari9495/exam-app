import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM1 on the seeded Kaveri Foods demo: the admin opens Settings › Performance (the drawn 6.3 page), copies the starters if
// needed, adds a template whose rated weights add up to 90, cannot activate it, brings them to 100 and activates it.
// Each run makes its own template, so the test can run again.

test('a review template can be activated only when its weights reach 100', async ({ page }) => {
  test.setTimeout(180_000);
  const name = `Plant annual ${Date.now().toString(36)}`;
  await signIn(page, 'admin@demo-org.test', 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  // Batch T2-C: the drawn 6.3 page; review templates are a list there, edited in a sheet.
  await page.goto('/yx/settings/talent/performance');
  const starters = page.getByRole('button', { name: 'Use the starters' });
  const list = page.getByRole('table', { name: 'Review templates' });
  await expect(starters.or(list).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(list).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Add a template' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /^Name/ }).fill(name);
  await sheet.getByRole('textbox', { name: /Weight/ }).fill('90');
  await expect(sheet.getByText('Weights of rated sections: 90 of 100')).toBeVisible();
  await sheet.getByRole('button', { name: 'Save draft' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });

  const edit = page.getByRole('button', { name: `Edit ${name} · version 1` });
  await edit.click();
  await expect(sheet.getByText('The weights of rated sections add up to 90, not 100.').first()).toBeVisible({ timeout: 30_000 });
  await sheet.getByRole('button', { name: 'Activate' }).click();
  await expect(sheet.getByText(/add up to 90, not 100/).first()).toBeVisible({ timeout: 30_000 });

  await sheet.getByRole('textbox', { name: /Weight/ }).fill('100');
  await sheet.getByRole('button', { name: 'Save draft' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  await edit.click();
  await sheet.getByRole('button', { name: 'Activate' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  // Active: it now offers a new version instead of an edit.
  await expect(list.getByRole('row', { name: new RegExp(name) }).getByText(/^Active/)).toBeVisible({ timeout: 30_000 });
  await edit.click();
  await expect(sheet.getByRole('button', { name: 'New version' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Save draft' })).toHaveCount(0);
});
