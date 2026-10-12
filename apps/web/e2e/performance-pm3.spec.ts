import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM3 on the seeded Kaveri Foods demo: Murugan praises Kavya, his manager; Kavya plans a 1:1 with
// him and adds to the agenda; Murugan sees the agenda and keeps a private note Kavya never sees; HR seals the
// feedback as a concern and Kavya sees only that HR removed it. Each run writes its own text, so it can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('feedback → 1:1 with a private note → HR seals a concern', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const praise = `Thanks for the line audit ${tag}`;

  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  await mu.goto('/yx/performance/feedback');
  await mu.getByRole('button', { name: 'Give feedback' }).click();
  const sheet = mu.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Report a concern instead' })).toBeVisible();
  await sheet.getByRole('combobox', { name: 'For' }).click();
  await mu.getByRole('option', { name: /Kavya/ }).first().click();
  await sheet.getByRole('textbox', { name: /^Feedback/ }).fill(praise);
  await sheet.getByRole('button', { name: 'Send feedback' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  await mu.getByRole('radio', { name: 'Given' }).click();
  await expect(mu.getByText(praise)).toBeVisible({ timeout: 30_000 });

  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await kv.goto('/yx/performance/feedback');
  await expect(kv.getByText(praise)).toBeVisible({ timeout: 30_000 });
  await kv.goto('/yx/performance/one-on-ones');
  await kv.getByRole('button', { name: 'Plan a 1:1' }).click();
  const plan = kv.getByRole('dialog');
  await plan.getByRole('combobox', { name: 'With' }).click();
  await kv.getByRole('option', { name: /Murugan/ }).first().click();
  await plan.getByRole('textbox', { name: '1:1 date' }).fill(shown(day(3)));
  await plan.getByRole('textbox', { name: '1:1 date' }).press('Enter');
  await plan.getByRole('button', { name: 'Plan', exact: true }).click();
  await kv.waitForURL(/\/yx\/performance\/one-on-ones\/[0-9a-f-]+$/, { timeout: 30_000 });
  const meetingUrl = kv.url();
  await kv.getByRole('textbox', { name: 'Add to the agenda' }).fill(`Line audit ${tag}`);
  await kv.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(kv.getByText(`Line audit ${tag}`)).toBeVisible({ timeout: 30_000 });

  await mu.goto(meetingUrl);
  await expect(mu.getByText(`Line audit ${tag}`)).toBeVisible({ timeout: 30_000 });
  await mu.getByRole('textbox', { name: /Only you/ }).fill(`Ask about the course ${tag}`);
  await mu.getByRole('button', { name: 'Save my note' }).click();
  await expect(mu.getByRole('button', { name: 'Save my note' })).toBeDisabled({ timeout: 30_000 });
  await kv.reload();
  await expect(kv.getByText(`Line audit ${tag}`)).toBeVisible({ timeout: 30_000 });
  await expect(kv.getByRole('textbox', { name: /Only you/ })).toHaveValue('');

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/performance/feedback');
  await admin.getByRole('radio', { name: 'Concerns' }).click();
  await admin.getByRole('combobox', { name: 'Employee' }).click();
  await admin.getByRole('option', { name: /Kavya/ }).first().click();
  const row = admin.getByRole('row').filter({ hasText: praise });
  await row.getByRole('button', { name: 'Seal' }).click();
  const seal = admin.getByRole('dialog');
  await seal.getByRole('textbox', { name: /Reason/ }).fill('Passed to the confidential channel');
  await seal.getByRole('button', { name: 'Seal', exact: true }).click();
  await expect(seal).toHaveCount(0, { timeout: 30_000 });

  await kv.goto('/yx/performance/feedback');
  await expect(kv.getByText('Removed by HR').first()).toBeVisible({ timeout: 30_000 });
  await expect(kv.getByText(praise)).toHaveCount(0);
});

test('on a phone, feedback can be given and the concern link is there', async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await signIn(page, 'kavya@demo-org.test', PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await page.goto('/yx/performance/feedback');
  await page.getByRole('button', { name: 'Give feedback' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('link', { name: 'Report a concern instead' })).toHaveAttribute('href', '/yx/desk/help');
  await sheet.getByRole('combobox', { name: 'For' }).click();
  await page.getByRole('option', { name: /Murugan/ }).first().click();
  const text = `Clear shift hand-over ${Date.now().toString(36)}`;
  await sheet.getByRole('textbox', { name: /^Feedback/ }).fill(text);
  await sheet.getByRole('button', { name: 'Send feedback' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
