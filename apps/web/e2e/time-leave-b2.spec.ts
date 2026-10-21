import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Step 4 · Time and leave batch 2, main flow on the seeded Kaveri Foods demo (Hosur plant): Murugan, a plant worker,
// claims the overtime of a recent day; his supervisor Kavya approves it in Approvals; the plant is a factory, so it is
// paid at the legal 2× through the payroll feed, never comp-off (founder decision 9 Oct 2026). Then Lakshmi (HR) locks last month for Kaveri Foods (Tamil Nadu) (the seed may have locked it already),
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

  // 1. Murugan claims a recent day with overtime (the designed My overtime screen).
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
  await hr.goto('/yx/time/periods');
  // The designed Periods screen (TIM-11): a section per legal entity, a card per month (last year's months show too).
  const month = hr.getByRole('region', { name: 'Kaveri Foods Pvt Ltd (Tamil Nadu)', exact: true }).getByRole('region', { name: monthName, exact: true });
  await expect(month).toBeVisible();
  // Payroll 5a: a locked month is reopened only by a two-approval request (payroll-5a.spec.ts), so lock it if it is open.
  if (await month.getByRole('button', { name: 'Pre-lock checklist' }).isVisible()) {
    await month.getByRole('button', { name: 'Pre-lock checklist' }).click();
    const lock = hr.getByRole('dialog');
    await lock.getByRole('button', { name: 'Lock period' }).click();
    await expect(lock).toHaveCount(0, { timeout: 60_000 });
  }
  await expect(month.getByText('Locked', { exact: true })).toBeVisible({ timeout: 60_000 });

  // 5. Murugan's fix for a day in that month is refused in plain words.
  const first = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), 1)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  await murugan.goto('/yx/time/attendance');
  await murugan.getByRole('button', { name: 'Regularise a day' }).click();
  const fix = murugan.getByRole('dialog', { name: 'New attendance request' });
  await fix.getByRole('textbox', { name: /^Date/ }).fill(first);
  await fix.getByRole('textbox', { name: /^Date/ }).press('Tab');
  await fix.getByRole('radio', { name: 'Full day (no punches)' }).check();
  await fix.getByRole('textbox', { name: 'Check-in' }).fill('09:00');
  await fix.getByRole('textbox', { name: 'Check-out' }).fill('17:00');
  await fix.getByRole('textbox', { name: /^Reason/ }).fill('The gate reader missed my check-out');
  await fix.getByRole('button', { name: 'Send request' }).click();
  await expect(fix.getByText(/is locked for attendance and leave/)).toBeVisible();
});
