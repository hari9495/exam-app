import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM5 on the seeded Kaveri Foods demo: the admin starts a plant cycle with feedback from colleagues;
// Murugan suggests Kiran, Kavya (his manager) approves, Kiran answers from "Feedback I owe"; with one answer Kavya
// sees it held back, never with a name. Each run makes its own cycle, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('nominate → approve → anonymous answer, held back below three', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const name = `Plant 360 ${tag}`;

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/settings/performance');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('tab', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(admin.getByRole('tab', { name: 'Review templates' })).toBeVisible({ timeout: 30_000 });
  // PRF-04 set-up wizard (5df0b91b3), with 360° feedback from 1 to 3 colleagues.
  await admin.goto('/yx/performance/cycles/new');
  const setup = admin.locator('main').last();
  const due = async (label: string, iso: string) => {
    await setup.getByRole('textbox', { name: label }).fill(shown(iso));
    await setup.getByRole('textbox', { name: label }).press('Enter');
  };
  await setup.getByRole('textbox', { name: /Cycle name/ }).fill(name);
  await setup.getByRole('combobox', { name: 'Type' }).click();
  await admin.getByRole('option', { name: 'Annual', exact: true }).click();
  await due('Period starts', '2025-04-01');
  await due('Period ends', '2026-03-31');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('combobox', { name: 'Departments in the cycle' }).click();
  await admin.getByRole('option', { name: /Production/ }).first().click();
  await admin.keyboard.press('Escape');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('combobox', { name: 'Template' }).click();
  await admin.getByRole('option', { name: /^Annual review/ }).first().click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('checkbox', { name: 'Include 360° feedback' }).click();
  await due('Self review due', day(7));
  await due('Manager review due', day(14));
  await due('360° feedback due', day(10));
  await setup.getByRole('textbox', { name: '360° reviewers, minimum' }).fill('1');
  await setup.getByRole('textbox', { name: '360° reviewers, maximum' }).fill('3');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await expect(setup.getByRole('region', { name: 'Stages and deadlines' })).toContainText('360° feedback');
  await setup.getByRole('button', { name: 'Launch cycle' }).click();
  await admin.waitForURL(/\/yx\/performance\/cycles\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(admin.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 30_000 });

  // Murugan nominates a colleague from his review (the reviews list was retired, 9a2c75b7f).
  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  await mu.goto('/yx/performance');
  await mu.getByRole('region', { name: `My review · ${name}` }).getByRole('link', { name: 'Open my review' }).click();
  await mu.getByRole('link', { name: 'Nominate reviewers' }).click();
  await mu.waitForURL(/\/yx\/performance\/reviews\/[0-9a-f-]+\/nominations$/, { timeout: 30_000 });
  const nominationsUrl = mu.url();
  const pageOf = (p: import('@playwright/test').Page) => p.locator('main').last();
  await expect(pageOf(mu).getByRole('region', { name: 'Reviewers · 0 of 1–3' })).toBeVisible({ timeout: 30_000 });
  await pageOf(mu).getByRole('combobox', { name: 'Add a reviewer' }).click();
  await mu.keyboard.type('Kiran');
  await mu.getByRole('option', { name: /Kiran/ }).first().click();
  await pageOf(mu).getByRole('button', { name: 'Add', exact: true }).click();
  await expect(pageOf(mu).getByRole('region', { name: 'Reviewers · 1 of 1–3' })).toContainText('Kiran Joshi', { timeout: 30_000 });
  await pageOf(mu).getByRole('button', { name: 'Send to manager for approval' }).click();
  await expect(pageOf(mu).getByRole('status').filter({ hasText: /^Sent to Kavya Reddy/ })).toBeVisible({ timeout: 30_000 });
  await expect(pageOf(mu).getByRole('listitem').filter({ hasText: 'Kiran Joshi' })).toContainText('Proposed');

  // Kavya, his manager, approves the list; Kiran is invited.
  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await kv.goto(nominationsUrl);
  await pageOf(kv).getByRole('button', { name: 'Approve list and invite' }).click();
  await expect(pageOf(kv).getByRole('status').filter({ hasText: /^Reviewers invited/ })).toBeVisible({ timeout: 30_000 });
  await expect(pageOf(kv).getByRole('listitem').filter({ hasText: 'Kiran Joshi' })).toContainText('Approved');

  // Kiran answers anonymously.
  const ki = await signedIn(browser, 'kiran@demo-org.test', PASSWORD);
  await ki.goto('/yx/performance/feedback-tasks');
  await ki.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Answer' }).click();
  await expect(pageOf(ki).getByRole('status').filter({ hasText: /^Anonymous/ })).toBeVisible({ timeout: 30_000 });
  await pageOf(ki).getByRole('radiogroup', { name: 'Rating for Competencies' }).getByRole('radio', { name: /^4 / }).click();
  await pageOf(ki).getByRole('button', { name: 'Send feedback' }).click();
  await ki.getByRole('dialog', { name: 'Send your feedback?' }).getByRole('button', { name: 'Send', exact: true }).click();
  await expect(pageOf(ki).getByText('Thank you. Your feedback is in.')).toBeVisible({ timeout: 30_000 });

  // One answer is fewer than three: it is held back on the review, and Kiran is never named.
  await kv.goto(nominationsUrl.replace(/\/nominations$/, ''));
  await expect(pageOf(kv).getByRole('status').filter({ hasText: /anonymous responses are held back: fewer than 3 in the group/ })).toBeVisible({ timeout: 30_000 });
  await expect(pageOf(kv).getByText(/Kiran/)).toHaveCount(0);
});
