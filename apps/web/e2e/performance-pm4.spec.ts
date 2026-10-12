import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM4 on the seeded Kaveri Foods demo: the admin starts a cycle for the plant team on the annual
// starter template after the pre-flight check; Murugan sends his self review and sees no score; Kavya, his manager,
// saves a draft, reads his self review and submits; the score is worked out from her ratings.
// Each run makes its own cycle for a past period of its own, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('cycle → self review → manager review with a worked-out score', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const name = `Plant review ${tag}`;
  const pick = async (page: import('@playwright/test').Page, label: string, iso: string) => {
    const box = page.getByRole('dialog').getByRole('textbox', { name: label });
    await box.fill(shown(iso));
    await box.press('Enter');
  };

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/settings/performance');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('tab', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await admin.goto('/yx/performance/cycles');
  await admin.getByRole('button', { name: 'New cycle' }).click();
  const sheet = admin.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /^Name/ }).fill(name);
  await sheet.getByRole('combobox', { name: 'Template' }).click();
  await admin.getByRole('option', { name: /^Annual review/ }).first().click();
  await pick(admin, 'Period starts on', '2025-04-01');
  await pick(admin, 'Period ends on', '2026-03-31');
  await sheet.getByRole('combobox', { name: 'Departments in the cycle' }).click();
  await admin.getByRole('option', { name: /Production/ }).first().click();
  await admin.keyboard.press('Escape');
  await pick(admin, 'Self review due', day(7));
  await pick(admin, 'Manager review due', day(14));
  await sheet.getByRole('button', { name: 'Save' }).click();
  await admin.waitForURL(/\/yx\/performance\/cycles\/[0-9a-f-]+$/, { timeout: 30_000 });
  await admin.getByRole('button', { name: 'Run the check' }).click();
  await expect(admin.getByText('Ready to start')).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Start the cycle' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(admin.getByText('Where reviews are')).toBeVisible({ timeout: 30_000 });

  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  await mu.goto('/yx/performance/reviews');
  await mu.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Open' }).click();
  await mu.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  for (const box of await mu.getByRole('textbox').all()) if (await box.isEditable()) await box.fill('Kept the line running through the monsoon.');
  await mu.getByRole('button', { name: 'Submit' }).click();
  await mu.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(mu.getByText(/Manager review · Kavya/).first()).toBeVisible({ timeout: 30_000 });
  await expect(mu.getByText('Score', { exact: true })).toHaveCount(0);

  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await kv.goto('/yx/performance/reviews');
  await kv.getByRole('radio', { name: 'My team' }).click();
  await kv.getByRole('row', { name: new RegExp(`Murugan.*${name}`) }).getByRole('button', { name: 'Open' }).click();
  await expect(kv.getByText(/Save a draft of your own first/)).toBeVisible({ timeout: 30_000 });
  await kv.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  await kv.getByRole('button', { name: 'Save draft' }).click();
  await expect(kv.getByText(/Murugan .*self review/)).toBeVisible({ timeout: 30_000 });
  await kv.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  for (const box of await kv.getByRole('textbox').all()) if (await box.isEditable()) await box.fill('Steady and safe.');
  await kv.getByRole('button', { name: 'Submit' }).click();
  await kv.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(kv.getByText(/^4 · /).first()).toBeVisible({ timeout: 30_000 });
  await expect(kv.getByText(/Competencies had no ratings/)).toBeVisible();
});
