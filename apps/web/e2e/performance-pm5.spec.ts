import { expect, test, type Browser, type Page } from '@playwright/test';
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
  const pick = async (page: Page, label: string, iso: string, inDialog = true) => {
    const box = (inDialog ? page.getByRole('dialog') : page).getByRole('textbox', { name: label });
    await box.fill(shown(iso));
    await box.press('Enter');
  };

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/settings/performance');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('tab', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(admin.getByRole('tab', { name: 'Review templates' })).toBeVisible({ timeout: 30_000 });
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
  await admin.getByRole('textbox', { name: /^Least people/ }).fill('1');
  await admin.getByRole('textbox', { name: /^Most people/ }).fill('3');
  await pick(admin, 'Feedback answers by', day(10), false);
  await admin.getByRole('button', { name: 'Turn on' }).click();
  await expect(admin.getByText(/^On: 1 to 3 people/)).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Run the check' }).click();
  await expect(admin.getByText('Ready to start')).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Start the cycle' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(admin.getByText('Where reviews are')).toBeVisible({ timeout: 30_000 });

  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  await mu.goto('/yx/performance/reviews');
  await mu.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Open' }).click();
  await mu.getByRole('button', { name: 'Suggest someone' }).click();
  await mu.getByRole('dialog').getByRole('combobox', { name: 'Who' }).click();
  await mu.getByPlaceholder('Name, email, role or department').fill('Kiran');
  await mu.getByRole('option', { name: /Kiran/ }).first().click();
  await mu.getByRole('dialog').getByRole('button', { name: 'Suggest' }).click();
  await expect(mu.getByText('Waiting for the manager')).toBeVisible({ timeout: 30_000 });
  const reviewUrl = mu.url();

  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await kv.goto(reviewUrl);
  await kv.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(kv.getByText('Asked', { exact: true })).toBeVisible({ timeout: 30_000 });

  const ki = await signedIn(browser, 'kiran@demo-org.test', PASSWORD);
  await ki.goto('/yx/performance/feedback-tasks');
  await ki.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Answer' }).click();
  await expect(ki.getByText('Anonymous', { exact: true })).toBeVisible({ timeout: 30_000 });
  await ki.getByRole('radiogroup', { name: 'Rating for Competencies' }).getByRole('radio', { name: /^4 / }).click();
  await ki.getByRole('button', { name: 'Send feedback' }).click();
  await ki.getByRole('dialog').getByRole('button', { name: 'Send' }).click();
  await expect(ki.getByText('Thank you. Your feedback is in.')).toBeVisible({ timeout: 30_000 });

  await kv.reload();
  await expect(kv.getByText(/Not enough responses to show one answer/)).toBeVisible({ timeout: 30_000 });
  await expect(kv.getByText('Kiran', { exact: false }).filter({ hasText: /average/ })).toHaveCount(0);
});
