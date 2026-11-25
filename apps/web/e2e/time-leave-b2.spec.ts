import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Step 4 · Time and leave batch 2, main flow on the seeded Kaveri Foods demo (Hosur plant): Murugan, a plant worker,
// claims the overtime of a recent day; his supervisor Kavya approves it in Approvals; the plant is a factory, so it is
// paid at the legal 2× through the payroll feed, never comp-off (founder decision 9 Oct 2026). Then Lakshmi (HR) locks last month for Kaveri Foods (Tamil Nadu) (the seed may have locked it already),
// and Murugan's half day in that month is frozen (a change to it goes as a late request HR also approves).
//
// Needs the API and web against the seeded database (locally: API on 3601, web on 3600 with
// NEXT_PUBLIC_API_BASE=http://localhost:3601/api/v1, WEB_BASE_URL=http://localhost:3600).

const PASSWORD = 'Passw0rd!2026';

async function signedIn(browser: import('@playwright/test').Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('Murugan claims overtime → Kavya approves → it is paid at 2× (Factories Act); HR locks last month → its days are frozen', async ({ browser }) => {
  test.setTimeout(300_000);

  // 1. Murugan claims a recent day with overtime.
  const murugan = await signedIn(browser, 'murugan@demo-org.test');
  await murugan.goto('/yx/time/overtime');
  const days = murugan.getByRole('table', { name: 'Days you can claim' });
  await expect(days).toBeVisible();
  await days.getByRole('button', { name: 'Claim overtime' }).first().click();
  const sheet = murugan.getByRole('dialog', { name: /^Claim overtime · / });
  await expect(sheet.getByText('Paid in payroll at the legal overtime rate (Factories Act)')).toBeVisible();
  await sheet.getByRole('textbox', { name: /What was it for/ }).fill('Stayed on for the line 2 changeover');
  await sheet.getByRole('button', { name: 'Send for approval' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(murugan.getByRole('table', { name: 'My claims' }).getByText('Waiting for approval').first()).toBeVisible();

  // 2. Kavya, his supervisor, approves in Approvals.
  const kavya = await signedIn(browser, 'kavya@demo-org.test');
  await kavya.goto('/yx/approvals');
  // Approvals is a table: the request opens with what the overtime is paid at.
  const request = kavya.getByRole('row', { name: /Murugan Selvam: overtime on/ }).first();
  await expect(request).toBeVisible({ timeout: 30_000 });
  await request.click();
  const open = kavya.getByRole('dialog', { name: /Murugan Selvam: overtime on/ });
  await expect(open.getByText('Paid in payroll at 2× (Factories Act)')).toBeVisible();
  await open.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(kavya.getByRole('row', { name: /Murugan Selvam: overtime on/ })).toHaveCount(0, { timeout: 30_000 });

  // 3. His claim is approved and paid through payroll at 2×.
  await murugan.goto('/yx/time/overtime');
  const claims = murugan.getByRole('table', { name: 'My claims' });
  await expect(claims.getByRole('row').filter({ hasText: 'Approved' }).filter({ hasText: 'Paid at 2×' }).first()).toBeVisible();

  // 4. Lakshmi (HR) locks last month for Kaveri Foods (Tamil Nadu), with a fresh second step.
  const hr = await signedIn(browser, 'hr@demo-org.test');
  await stepUp('hr@demo-org.test');
  const last = new Date(Date.now() + 330 * 60_000);
  last.setUTCDate(0);
  const monthName = last.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  await hr.goto(`/yx/time/periods`);
  if (last.getUTCFullYear() !== new Date(Date.now() + 330 * 60_000).getUTCFullYear()) await hr.getByRole('button', { name: 'Previous year' }).click();
  // Periods (redesigned): each company is a region, each month a region with its status and next action.
  const company = hr.getByRole('region', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu) periods' });
  const row = company.getByRole('region', { name: monthName });
  await expect(row).toBeVisible();
  // Payroll 5a: a locked month is reopened only by a two-approval request (payroll-5a.spec.ts), so lock it if it is open.
  if (await row.getByRole('button', { name: 'Pre-lock checklist' }).isVisible()) {
    await row.getByRole('button', { name: 'Pre-lock checklist' }).click();
    const lock = hr.getByRole('dialog', { name: `${monthName} · pre-lock checklist` });
    const checks = lock.getByRole('list', { name: 'Pre-lock checklist' });
    await expect(checks.getByRole('listitem').filter({ hasText: 'Requests decided' })).toContainText('Done', { timeout: 60_000 });
    await lock.getByRole('button', { name: 'Lock the month' }).click();
    await expect(lock).toHaveCount(0, { timeout: 60_000 });
  }
  await expect(row.getByText('Locked', { exact: true })).toBeVisible();

  // 5. Murugan's half day in that month is frozen: its day card says the month is locked, and any change to it
  // now goes as a late request that HR also approves, paid in the open payroll (no direct change).
  await murugan.goto('/yx/time/attendance');
  await murugan.getByRole('button', { name: 'Previous month' }).click();
  await expect(murugan.getByRole('heading', { name: monthName, level: 2 })).toBeVisible();
  await murugan.getByRole('button', { name: /: Half day$/ }).first().click();
  const day = murugan.getByRole('dialog');
  await expect(day.getByRole('status')).toContainText(`${monthName} is locked`);
  await expect(day.getByRole('status')).toContainText('Changes to this day go as a late request, which HR also approves.');
});
