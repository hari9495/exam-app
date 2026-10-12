import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Payroll batch 5j, the main flow on the seeded Kaveri Foods demo: Suresh (Payroll Admin) runs last month's payroll for
// Kaveri Foods Pvt Ltd and sends it for approval; Meena (Payroll Approver) and Neha (Finance) approve it with the typed
// phrase; Suresh makes the bank file and Meena releases it; Suresh publishes the payslips; Kavya (Compliance Owner) makes,
// uploads and files the PF return in the filings hub; Arjun sees his payslip with every line explained.
//
// Needs the API and web against a freshly seeded database (locally: API on 3801, web on 3800 with
// NEXT_PUBLIC_API_BASE=http://localhost:3801/api/v1, WEB_BASE_URL=http://localhost:3800, E2E_DATABASE_URL for step-up).

const PASSWORD = 'Passw0rd!2026';
const SHOTS = process.env.E2E_SCREENSHOTS;
const last = (() => {
  const d = new Date(Date.now() + 330 * 60_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
})();
const lastText = new Date(`${last}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

async function as(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}
const shot = async (page: Page, name: string) => SHOTS && (await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }));

test('a month of payroll: run, approve, bank file, publish, file PF, and the employee sees the payslip', async ({ browser }) => {
  test.setTimeout(420_000);

  // Suresh starts last month's payroll for Kaveri Foods Pvt Ltd and calculates it.
  const suresh = await as(browser, 'payroll@demo-org.test');
  await suresh.goto('/yx/payroll/runs');
  await expect(suresh.getByRole('heading', { name: 'Payroll runs' })).toBeVisible();
  await suresh.getByRole('button', { name: 'New run' }).first().click();
  await expect(suresh.getByRole('radio', { name: 'Monthly payroll' })).toBeChecked();
  await suresh.getByRole('combobox', { name: 'Pay group' }).click();
  await suresh.getByRole('option', { name: 'Monthly staff · KFPL', exact: true }).click();
  await suresh.getByLabel('Month').fill(last);
  await suresh.getByRole('button', { name: 'Create run' }).click();
  await expect(suresh.getByRole('heading', { name: `Payroll · ${lastText}` })).toBeVisible({ timeout: 30_000 });
  const runUrl = suresh.url();
  await suresh.getByRole('button', { name: /^Calculate/ }).click();
  const payslips = suresh.getByRole('table', { name: 'Payslips' });
  await expect(payslips).toBeVisible({ timeout: 90_000 });
  await shot(suresh, '5j-payslips');
  await suresh.getByRole('button', { name: /Why these numbers for Arjun/ }).click();
  await expect(suresh.getByRole('table', { name: 'Deductions' })).toContainText('IN.PF');
  await suresh.keyboard.press('Escape');
  await suresh.getByRole('tab', { name: /Approval/ }).click();
  await suresh.getByRole('button', { name: 'Send for approval' }).click();
  await expect(suresh.getByText(/someone else approves it/)).toBeVisible({ timeout: 30_000 });

  // Meena, then Neha, approve with the typed phrase.
  for (const email of ['payroll-approver@demo-org.test', 'finance@demo-org.test']) {
    const approver = await as(browser, email);
    await approver.goto(runUrl);
    await approver.getByRole('button', { name: 'Approve and lock' }).click({ timeout: 30_000 });
    await approver.getByRole('textbox', { name: /Type/ }).fill(`APPROVE KFPL ${last}`);
    await approver.getByRole('button', { name: 'Approve and lock' }).last().click();
    await expect(approver.getByRole('button', { name: 'Approve and lock' })).toHaveCount(0, { timeout: 30_000 });
    await approver.context().close();
  }

  // Suresh makes the bank file; Meena (not its maker) releases it.
  await suresh.reload();
  await suresh.getByRole('tab', { name: 'Bank file' }).click();
  await suresh.getByRole('textbox', { name: /Company account the bank debits/ }).fill('0050200012345678');
  await suresh.getByRole('button', { name: 'Make bank file' }).click();
  await expect(suresh.getByText(/Bank file made:/)).toBeVisible({ timeout: 30_000 });
  await shot(suresh, '5j-bank-file');
  const meena = await as(browser, 'payroll-approver@demo-org.test');
  await meena.goto(runUrl);
  await meena.getByRole('tab', { name: 'Bank file' }).click();
  const rows = (await meena.getByRole('table', { name: 'Bank files' }).locator('tbody tr').first().locator('td').first().textContent())!.trim();
  await meena.getByRole('button', { name: 'Release', exact: true }).click();
  await meena.getByRole('textbox', { name: /Type/ }).fill(`RELEASE ${rows}`);
  await meena.getByRole('button', { name: 'Release file' }).click();
  await expect(meena.getByRole('table', { name: 'Bank files' })).toContainText('Released', { timeout: 30_000 });

  // Suresh publishes the payslips.
  await suresh.reload();
  await suresh.getByRole('tab', { name: 'Publish' }).click();
  const publish = suresh.getByRole('button', { name: /^Publish \d+ payslips$/ });
  const count = (await publish.textContent())!.match(/\d+/)![0];
  await publish.click();
  await suresh.getByRole('textbox', { name: /Type/ }).fill(`PUBLISH ${count}`);
  await suresh.getByRole('button', { name: 'Publish payslips' }).click();
  await expect(suresh.getByText('Payslips published')).toBeVisible({ timeout: 30_000 });
  await shot(suresh, '5j-published');

  // Kavya makes the PF file, records the upload and files it: the month locks as filed.
  const kavya = await as(browser, 'compliance@demo-org.test');
  await kavya.goto('/yx/payroll/statutory');
  const dues = kavya.getByRole('table', { name: 'Statutory dues' });
  await expect(dues).toBeVisible({ timeout: 30_000 });
  await shot(kavya, '5j-filings-hub');
  const pf = dues.getByRole('row', { name: /PF \(ECR\)/ });
  await pf.getByRole('button', { name: 'Make file' }).click();
  await expect(pf).toContainText('File made', { timeout: 30_000 });
  await pf.getByRole('button', { name: 'Mark uploaded' }).click();
  await kavya.getByRole('textbox', { name: /Portal reference/ }).fill('TRRN-5554443');
  await kavya.getByRole('button', { name: 'Save' }).click();
  await expect(pf).toContainText('Uploaded', { timeout: 30_000 });
  await pf.getByRole('button', { name: 'Mark filed' }).click();
  await kavya.getByRole('textbox', { name: /Type/ }).fill(`FILED PF ${last}`);
  await kavya.getByRole('button', { name: 'Mark filed' }).last().click();
  await expect(pf).toContainText('Filed', { timeout: 30_000 });

  // Arjun sees his payslip, every line explained.
  const arjun = await as(browser, 'arjun@demo-org.test');
  await arjun.goto('/yx/me/payslips');
  await arjun.getByRole('button', { name: `Open payslip for ${lastText}` }).click();
  await expect(arjun.getByRole('table', { name: 'Earnings' })).toContainText('Basic', { timeout: 30_000 });
  await expect(arjun.getByRole('region', { name: 'Reimbursements' })).toBeVisible();
  await shot(arjun, '5j-my-payslip');
});
