import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM7 on the seeded Kaveri Foods demo: the admin starts a comp cycle from the starter matrix, opens
// it, and a change outside the matrix asks for a reason. Apply needs a fresh second factor, so it is covered by the API
// e2e instead. Each run makes its own cycle, so the test can run again.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

test('comp review: start a cycle, open it, and a change outside the matrix needs a reason', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, 'admin@demo-org.test', 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  // The matrix uses the rating scale: the performance starters come first (as in PM6).
  await page.goto('/yx/settings/performance');
  const starters = page.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(page.getByRole('tab', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(page.getByRole('tab', { name: 'Review templates' })).toBeVisible({ timeout: 30_000 });
  await page.goto('/yx/performance/comp');
  const create = page.getByRole('button', { name: 'New comp cycle' });
  const starter = page.getByRole('button', { name: 'Use the starter matrix' });
  await expect(starter.or(page.getByRole('button', { name: 'New comp cycle', disabled: false })).first()).toBeVisible({ timeout: 30_000 });
  if (await starter.isVisible()) await starter.click();
  await expect(create).toBeEnabled({ timeout: 30_000 });
  await create.click();
  const d = page.getByRole('dialog');
  await d.getByRole('textbox', { name: /^Name/ }).fill(`Merit ${Date.now().toString(36)}`);
  const on = d.getByRole('textbox', { name: 'Effective from' });
  // One cycle per entity, currency and date: each run takes its own date.
  await on.fill(shown(new Date(Date.now() + (30 + Math.floor(Math.random() * 600)) * 86_400_000).toISOString().slice(0, 10)));
  await on.press('Enter');
  await d.getByRole('button', { name: 'Create' }).click();
  await page.waitForURL(/\/yx\/performance\/comp\/[0-9a-f-]+$/, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Open for proposals' }).click();
  await expect(page.getByRole('button', { name: 'Open for proposals' })).toBeHidden({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Change' }).first().click();
  const sheet = page.getByRole('dialog');
  const merit = sheet.getByRole('textbox', { name: /Merit increase/ });
  await merit.fill('40');
  await expect(sheet.getByRole('button', { name: 'Save' })).toBeDisabled();
  await sheet.getByRole('textbox', { name: /^Why/ }).fill('Market correction for a scarce skill');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Outside the matrix').first()).toBeVisible({ timeout: 30_000 });
});
