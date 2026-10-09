import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Step 5 · Payroll batch 5b, main flow on the seeded Kaveri Foods demo: Suresh (Payroll Admin) sees what set-up still
// needs, the starter components and template, the published statutory rules, the payslip layout with its required
// particulars; then works out Arjun's salary from a CTC (statutory lines cited) and sends it for approval.
//
// Needs the API and web against the seeded database (locally: API on 3801, web on 3800 with
// NEXT_PUBLIC_API_BASE=http://localhost:3801/api/v1, WEB_BASE_URL=http://localhost:3800).

const PASSWORD = 'Passw0rd!2026';
const SHOTS = process.env.E2E_SCREENSHOTS;

test('Suresh checks the set-up, then works out a salary from a CTC and sends it for approval', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signIn(page, 'payroll@demo-org.test', PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('payroll@demo-org.test');
  const shot = async (name: string) => SHOTS && (await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }));

  // Set-up: the checklist and the registrations of Kaveri Foods Pvt Ltd.
  await page.goto('/yx/payroll/setup');
  await expect(page.getByRole('heading', { name: 'Payroll set-up' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Statutory registrations' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Set-up steps' })).toContainText('Pay groups');
  await shot('5b-setup');

  // The library and the starter template.
  await page.goto('/yx/payroll/components');
  await expect(page.getByRole('table', { name: 'Earnings' })).toContainText('Basic');
  await expect(page.getByRole('table', { name: 'Deductions' })).toContainText('Provident fund (employee)');
  await shot('5b-components');
  await page.goto('/yx/payroll/templates');
  await expect(page.getByText('Standard monthly (India starter)')).toBeVisible();
  await shot('5b-templates');

  // Published rules and the payslip's required particulars.
  await page.goto('/yx/payroll/statutory-rules');
  await expect(page.getByRole('table', { name: 'Statutory rules' })).toContainText('Provident fund');
  await shot('5b-rules');
  await page.goto('/yx/payroll/payslip-layout');
  await expect(page.getByRole('list', { name: 'Always shown' })).toContainText('Net wages paid');
  await shot('5b-layout');

  // Arjun's salary from a CTC: the breakup cites the PF rule; it goes for approval.
  await page.goto('/yx/payroll/compensation');
  await page.getByRole('textbox', { name: 'Find a person' }).fill('Arjun');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.getByRole('button', { name: /Arjun Kulkarni/ }).click();
  await expect(page.getByText('Salary in force')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('combobox', { name: 'Template' }).click();
  await page.getByRole('option', { name: /Standard monthly/ }).click();
  await page.getByRole('textbox', { name: 'Annual CTC' }).fill('900000');
  await page.getByRole('button', { name: 'Work out the breakup' }).click();
  const breakup = page.getByRole('table', { name: 'Salary breakup' });
  await expect(breakup).toContainText('Provident fund (employee)');
  await expect(breakup).toContainText('₹75,000.00');
  await shot('5b-compensation');
  await page.getByRole('region', { name: 'New or revised salary' }).getByRole('textbox', { name: /Reason/ }).fill(`Annual review ${Date.now()}`);
  await page.getByRole('button', { name: 'Send for approval' }).click();
  await expect(page.getByText('Sent for approval.', { exact: false })).toBeVisible({ timeout: 30_000 });
});
