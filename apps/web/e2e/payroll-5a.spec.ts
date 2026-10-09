import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Step 5 · Payroll batch 5a, main flow on the seeded Kaveri Foods demo: Suresh (Payroll Admin) asks to reopen last
// month for Kaveri Foods Pvt Ltd (Tamil Nadu); Meena (Payroll Approver) checks it and Neha (Finance Approver) gives the
// final approval, each with a fresh second step and the typed phrase; the month reopens. Then the System Admin checks the
// audit chain and it is OK.
//
// Needs the API and web against the seeded database (locally: API on 3801, web on 3800 with
// NEXT_PUBLIC_API_BASE=http://localhost:3801/api/v1, WEB_BASE_URL=http://localhost:3800).

const PASSWORD = 'Passw0rd!2026';
const ENTITY = 'Kaveri Foods Pvt Ltd (Tamil Nadu)';

async function signedIn(browser: import('@playwright/test').Browser, email: string, password = PASSWORD) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}

test('Suresh asks to reopen last month → Meena checks → Neha approves → the month reopens; the audit chain checks OK', async ({ browser }) => {
  test.setTimeout(300_000);
  const last = new Date(Date.now() + 330 * 60_000);
  last.setUTCDate(0);
  const month = last.toISOString().slice(0, 7);
  const monthName = last.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const sameYear = last.getUTCFullYear() === new Date(Date.now() + 330 * 60_000).getUTCFullYear();

  // 0. The seed locks last month for the Tamil Nadu entity; if an earlier run reopened it, HR locks it again.
  const hr = await signedIn(browser, 'hr@demo-org.test');
  await hr.goto('/yx/time/periods');
  if (!sameYear) await hr.getByRole('button', { name: 'Previous year' }).click();
  const hrRow = hr.getByRole('table', { name: `${ENTITY} periods` }).getByRole('row').filter({ hasText: monthName });
  await expect(hrRow).toBeVisible();
  if (await hrRow.getByRole('button', { name: 'Lock' }).isVisible()) {
    await hrRow.getByRole('button', { name: 'Lock' }).click();
    const lock = hr.getByRole('dialog');
    await expect(lock.getByText('Ready to lock')).toBeVisible({ timeout: 60_000 });
    await lock.getByRole('button', { name: 'Lock the month' }).click();
    await expect(lock).toHaveCount(0, { timeout: 60_000 });
  }
  await expect(hrRow.getByText('Locked', { exact: true })).toBeVisible();

  // 1. Suresh asks to reopen it on Pay periods.
  const suresh = await signedIn(browser, 'payroll@demo-org.test');
  await suresh.goto('/yx/payroll/periods');
  if (!sameYear) await suresh.getByRole('button', { name: 'Previous year' }).click();
  const row = suresh.getByRole('table', { name: `${ENTITY} pay periods` }).getByRole('row').filter({ hasText: monthName });
  await expect(row.getByText('Locked', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Ask to reopen' }).click();
  const ask = suresh.getByRole('dialog');
  await ask.getByRole('textbox', { name: /Why/ }).fill('A late overtime claim of the Hosur plant was approved after the lock');
  await ask.getByRole('button', { name: 'Send for approval' }).click();
  await expect(ask).toHaveCount(0);
  await expect(row.getByRole('button', { name: 'Reopen asked' })).toBeVisible();

  // 2. Meena checks it (the first approval) on Reopen requests: she types the phrase.
  const approve = async (email: string) => {
    const page = await signedIn(browser, email);
    await page.goto('/yx/payroll/reopen-requests');
    const card = page.locator('section').filter({ has: page.getByRole('heading', { name: `${monthName} · ${ENTITY}` }) }).first();
    await card.getByRole('button', { name: 'Approve', exact: true }).click();
    const sheet = page.getByRole('dialog');
    const phrase = `REOPEN KFPL-TN ${month}`;
    await sheet.getByRole('textbox', { name: new RegExp(`Type ${phrase} to confirm`) }).fill(phrase);
    await sheet.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(sheet).toHaveCount(0);
    return page;
  };
  await approve('payroll-approver@demo-org.test');

  // 3. Neha gives the final approval: the month opens.
  const neha = await approve('finance@demo-org.test');
  await neha.goto('/yx/payroll/periods');
  if (!sameYear) await neha.getByRole('button', { name: 'Previous year' }).click();
  const after = neha.getByRole('table', { name: `${ENTITY} pay periods` }).getByRole('row').filter({ hasText: monthName });
  await expect(after.getByText('Open', { exact: true })).toBeVisible();

  // 4. The System Admin checks the audit chain: OK.
  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/payroll/audit');
  await admin.getByRole('button', { name: 'Check now' }).click();
  await expect(admin.getByText('Chain OK')).toBeVisible({ timeout: 60_000 });
  await expect(admin.getByRole('table', { name: 'Audit events' }).getByText('Payroll period reopened').first()).toBeVisible();
});
