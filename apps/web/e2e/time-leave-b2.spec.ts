import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Step 4 · Time and leave batch 2, main flow on the seeded Kaveri Foods demo (Hosur plant): Murugan, a plant worker,
// claims the overtime of a recent day; his supervisor Kavya approves it in Approvals; the plant is a factory, so it is
// paid at the legal 2× through the payroll feed, never comp-off (founder decision 9 Oct 2026). Then Lakshmi (HR) locks last month for Kaveri Foods (Tamil Nadu) (unlocking it first if the seed locked it),
// and Murugan's fix for a half day in that month is refused.
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

test('Murugan claims overtime → Kavya approves → it is paid at 2× (Factories Act); HR locks last month → a fix in it is refused', async ({ browser }) => {
  test.setTimeout(300_000);

  // 1. Murugan claims a recent day with overtime.
  const murugan = await signedIn(browser, 'murugan@demo-org.test');
  await murugan.goto('/yx/time/overtime');
  const days = murugan.getByRole('list', { name: 'Days with overtime' });
  await expect(days).toBeVisible();
  await days.getByRole('button', { name: 'Claim overtime' }).first().click();
  const sheet = murugan.getByRole('dialog');
  await expect(sheet.getByText('Paid in payroll at the legal overtime rate (Factories Act)')).toBeVisible();
  await sheet.getByRole('textbox', { name: /What was it for/ }).fill('Stayed on for the line 2 changeover');
  await sheet.getByRole('button', { name: 'Send for approval' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(murugan.getByRole('table', { name: 'My overtime claims' }).getByText('Waiting for approval').first()).toBeVisible();

  // 2. Kavya, his supervisor, approves in Approvals.
  const kavya = await signedIn(browser, 'kavya@demo-org.test');
  await kavya.goto('/yx/approvals');
  const card = kavya.locator('section').filter({ has: kavya.getByRole('heading', { name: /Murugan Selvam: overtime on/ }) }).last();
  await expect(card).toBeVisible();
  await expect(card.getByText('Paid in payroll at 2× (Factories Act)')).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);

  // 3. His claim is approved and paid through payroll at 2×.
  await murugan.goto('/yx/time/overtime');
  const claims = murugan.getByRole('table', { name: 'My overtime claims' });
  await expect(claims.getByRole('row').filter({ hasText: 'Approved' }).filter({ hasText: 'Paid in payroll at 2×' }).first()).toBeVisible();

  // 4. Lakshmi (HR) locks last month for Kaveri Foods (Tamil Nadu), with a fresh second step.
  const hr = await signedIn(browser, 'hr@demo-org.test');
  await stepUp('hr@demo-org.test');
  const last = new Date(Date.now() + 330 * 60_000);
  last.setUTCDate(0);
  const monthName = last.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  await hr.goto(`/yx/time/periods`);
  if (last.getUTCFullYear() !== new Date(Date.now() + 330 * 60_000).getUTCFullYear()) await hr.getByRole('button', { name: 'Previous year' }).click();
  const table = hr.getByRole('table', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu) periods' });
  const row = table.getByRole('row').filter({ hasText: monthName });
  await expect(row).toBeVisible();
  if (await row.getByRole('button', { name: 'Unlock' }).isVisible()) {
    await row.getByRole('button', { name: 'Unlock' }).click();
    const un = hr.getByRole('dialog');
    await un.getByRole('textbox', { name: /Why/ }).fill('Re-checking the plant roster before payroll');
    await un.getByRole('button', { name: 'Unlock the month' }).click();
    await expect(un).toHaveCount(0);
  }
  await row.getByRole('button', { name: 'Lock' }).click();
  const lock = hr.getByRole('dialog');
  await expect(lock.getByText('Ready to lock')).toBeVisible({ timeout: 60_000 });
  await lock.getByRole('button', { name: 'Lock the month' }).click();
  await expect(lock).toHaveCount(0, { timeout: 60_000 });
  await expect(row.getByText('Locked', { exact: true })).toBeVisible();

  // 5. Murugan's fix for his half day in that month is refused in plain words.
  await murugan.goto('/yx/time/attendance');
  await murugan.getByRole('button', { name: 'Previous month' }).click();
  await murugan.getByRole('button', { name: 'Fix this day' }).first().click();
  const fix = murugan.getByRole('dialog');
  await fix.getByRole('textbox', { name: /What happened/ }).fill('The gate reader missed my check-out');
  await fix.getByRole('button', { name: 'Send for approval' }).click();
  await expect(fix.getByText(/is locked for attendance and leave/)).toBeVisible();
});
