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

test('Suresh checks the set-up; HR works out a salary from a CTC and sends it for approval', async ({ browser }) => {
  test.setTimeout(240_000);
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signIn(page, 'payroll@demo-org.test', PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('payroll@demo-org.test');
  const shot = async (name: string) => SHOTS && (await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }));

  // Set-up: the checklist and the registrations of Kaveri Foods Pvt Ltd.
  await page.goto('/yx/payroll/setup');
  await expect(page.getByRole('heading', { name: 'Set up payroll', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Statutory registrations' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('navigation', { name: 'Payroll set-up steps' })).toContainText('Pay group and cut-off');
  await shot('5b-setup');

  // The library and the starter template.
  await page.goto('/yx/payroll/components');
  // One table grouped by type: the earnings and deductions groups with the starter lines.
  const library = page.getByRole('table', { name: 'Pay components' });
  await expect(library.getByRole('row', { name: /^Earnings \d+$/ })).toBeVisible({ timeout: 30_000 });
  await expect(library.getByRole('row', { name: /^Basic / })).toBeVisible();
  await expect(library.getByRole('row', { name: /^Deductions \d+$/ })).toBeVisible();
  await expect(library.getByRole('row', { name: /^Provident fund \(employee\) Statutory / })).toBeVisible();
  await shot('5b-components');
  await page.goto('/yx/payroll/templates');
  await expect(page.getByRole('heading', { name: 'Standard monthly (India starter)', level: 1 })).toBeVisible({ timeout: 30_000 });
  await shot('5b-templates');

  // Published rules and the payslip's required particulars.
  await page.goto('/yx/payroll/statutory-rules');
  await expect(page.getByRole('table', { name: 'Statutory rule sets' }).getByRole('row', { name: /^Provident fund All India .* In force/ }).first()).toBeVisible({ timeout: 30_000 });
  await shot('5b-rules');
  await page.goto('/yx/payroll/payslip-layout');
  await expect(page.getByRole('list', { name: 'Always shown' })).toContainText('Net wages paid');
  await shot('5b-layout');

  // Founder 21 Oct 2026 (option A): only HR changes pay. Suresh reads the salary in force, but has no new salary.
  await page.goto('/yx/payroll/compensation');
  await page.getByRole('textbox', { name: 'Find a person' }).fill('Arjun');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await page.getByRole('button', { name: /Arjun Kulkarni/ }).click();
  await expect(page.getByRole('table', { name: 'Current breakup' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Revise compensation' })).toHaveCount(0);

  // Lakshmi (HR) works out Arjun's salary from a CTC: the breakup cites the PF rule; it goes for approval.
  const hr = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signIn(hr, 'hr@demo-org.test', PASSWORD);
  await hr.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('hr@demo-org.test');
  await hr.goto('/yx/payroll/compensation');
  await hr.getByRole('textbox', { name: 'Find a person' }).fill('Arjun');
  await hr.getByRole('button', { name: 'Search', exact: true }).click();
  await hr.getByRole('button', { name: /Arjun Kulkarni/ }).click();
  await expect(hr.getByRole('table', { name: 'Current breakup' })).toBeVisible({ timeout: 30_000 });
  await hr.getByRole('button', { name: 'Revise compensation' }).click();
  const revise = hr.getByRole('dialog', { name: 'Revise compensation' });
  await revise.getByRole('textbox', { name: /^Reason/ }).fill(`Annual review ${Date.now()}`);
  await revise.getByRole('textbox', { name: /New annual CTC/ }).fill('900000');
  await revise.getByRole('combobox', { name: /Salary template/ }).click();
  await hr.getByRole('option', { name: /Standard monthly/ }).click();
  await revise.getByRole('button', { name: 'Work out the breakup' }).click();
  await expect(revise).toContainText('Provident fund (employee)', { timeout: 30_000 });
  await expect(revise).toContainText('₹75,000.00');
  await shot('5b-compensation');
  await revise.getByRole('button', { name: 'Send for approval' }).click();
  await expect(revise).toHaveCount(0, { timeout: 30_000 });
  await expect(hr.getByText(/Sent for approval/).first()).toBeVisible({ timeout: 30_000 });
});
