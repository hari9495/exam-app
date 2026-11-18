import { expect, test, type Browser } from '@playwright/test';
import { approveRequest } from './fixtures/approvals';
import { signIn } from './fixtures/sign-in';

// Performance batch PM2 on the seeded Kaveri Foods demo: the admin opens a goal period; Murugan adds an objective with
// a key result and sends it to Kavya, his manager, who approves it in her approvals; Murugan checks in and sees the
// progress worked out from the key result. Each run makes its own period, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('goal → manager approves → check-in shows worked-out progress', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const periodName = `Period ${tag}`;

  // Goal periods are opened on the company goal map (PRF-03) by whoever manages goals.
  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/performance/goal-map');
  await admin.getByRole('button', { name: 'Add period' }).first().click();
  const dlg = admin.getByRole('dialog', { name: 'Add a goal period' });
  await dlg.getByRole('textbox', { name: /^Name/ }).fill(periodName);
  await dlg.getByRole('textbox', { name: 'Period starts on' }).fill(shown(day(-10)));
  await dlg.getByRole('textbox', { name: 'Period starts on' }).press('Enter');
  await dlg.getByRole('textbox', { name: 'Period ends on' }).fill(shown(day(170)));
  await dlg.getByRole('textbox', { name: 'Period ends on' }).press('Enter');
  await dlg.getByRole('button', { name: 'Add period' }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });

  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  const pickPeriod = async () => {
    await mu.goto('/yx/performance/goals');
    await mu.getByRole('combobox', { name: 'Period' }).click();
    await mu.getByRole('option', { name: periodName }).click();
  };
  await pickPeriod();
  await mu.getByRole('button', { name: 'Add goal' }).first().click();
  const sheet = mu.getByRole('dialog', { name: 'Add goal' });
  await sheet.getByRole('textbox', { name: /^Goal/ }).fill(`Cut seal rejects ${tag}`);
  await sheet.getByRole('textbox', { name: /^Weight/ }).fill('100');
  await sheet.getByRole('textbox', { name: 'Key result 1', exact: true }).fill('Lines on the new checklist');
  await sheet.getByRole('textbox', { name: 'Target' }).fill('3');
  await sheet.getByRole('button', { name: 'Save goal' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  const goal = mu.getByRole('list', { name: 'My goals' }).getByRole('listitem').filter({ hasText: `Cut seal rejects ${tag}` }).first();
  await expect(goal).toContainText('Draft');
  await mu.getByRole('button', { name: 'Send to my manager' }).click();
  await mu.getByRole('dialog', { name: 'Send your goal to your manager?' }).getByRole('button').last().click();
  await expect(mu.getByText('With your manager').first()).toBeVisible({ timeout: 30_000 });

  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await approveRequest(kv, new RegExp(`Goals for ${periodName}`));

  await pickPeriod();
  await mu.getByRole('button', { name: 'Check in' }).click();
  const check = mu.getByRole('dialog');
  await check.getByRole('textbox', { name: /Lines on the new checklist/ }).fill('2');
  await check.getByRole('button', { name: 'Save check-in' }).click();
  await expect(check).toHaveCount(0, { timeout: 30_000 });
  // Worked out from the key result (2 of 3), never typed: the goal and its key result read 67% (rounded).
  await expect(goal.getByRole('img', { name: `Cut seal rejects ${tag}: 67% complete` })).toBeVisible({ timeout: 30_000 });
  await expect(goal).toContainText(/Lines on the new checklist\s*2 of 3/);
});
