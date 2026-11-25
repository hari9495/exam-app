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

  // Suresh starts last month's payroll for Kaveri Foods Pvt Ltd and calculates it (Payroll home: one row per pay group).
  const suresh = await as(browser, 'payroll@demo-org.test');
  await suresh.goto('/yx/payroll/runs');
  await expect(suresh.getByRole('heading', { name: 'Payroll', level: 1 })).toBeVisible({ timeout: 30_000 });
  await suresh.getByRole('list', { name: 'Runs by pay group' }).getByRole('listitem').filter({ hasText: 'Monthly staff · KFPL' }).filter({ hasNotText: 'KFPL-TN' }).getByRole('button', { name: 'Start run' }).click();
  const start = suresh.getByRole('dialog', { name: 'Start a payroll run' });
  await expect(start.getByRole('combobox', { name: /Pay group/ })).toContainText('Monthly staff · KFPL');
  await expect(start.getByRole('combobox', { name: /Pay group/ })).not.toContainText('KFPL-TN');
  await start.getByRole('textbox', { name: /^Month/ }).fill(last);
  await start.getByRole('button', { name: 'Create run' }).click();
  await expect(suresh.getByRole('heading', { name: `Payroll · ${lastText}` })).toBeVisible({ timeout: 30_000 });
  const runUrl = suresh.url();
  const run = (p: Page) => p.locator('main').last();
  await run(suresh).getByRole('button', { name: 'Calculate' }).click();
  await expect(run(suresh).getByRole('button', { name: 'Submit for approval' })).toBeVisible({ timeout: 90_000 });
  await suresh.getByRole('tab', { name: /^Payslips/ }).click();
  const payslips = run(suresh).getByRole('table', { name: 'Payslips in this run' });
  await expect(payslips).toBeVisible({ timeout: 30_000 });
  await shot(suresh, '5j-payslips');
  // Why this number: every line names the rule it came from.
  await payslips.getByRole('button', { name: 'More actions for Arjun Kulkarni' }).click();
  await suresh.getByRole('menuitem', { name: 'Why this number' }).click();
  const why = suresh.getByRole('dialog', { name: 'Arjun Kulkarni' });
  await why.getByRole('button', { name: /^Provident fund \(employee\)/ }).click();
  await expect(why).toContainText('IN.PF');
  await suresh.keyboard.press('Escape');
  await run(suresh).getByRole('button', { name: 'Submit for approval' }).click();
  await expect(run(suresh).getByText(/someone else approves it/)).toBeVisible({ timeout: 30_000 });

  // Meena, then Neha, approve with the typed phrase.
  for (const email of ['payroll-approver@demo-org.test', 'finance@demo-org.test']) {
    const approver = await as(browser, email);
    await approver.goto(runUrl);
    await run(approver).getByRole('button', { name: 'Approve and lock' }).click({ timeout: 30_000 });
    const sure = approver.getByRole('dialog', { name: `Approve and lock ${lastText}` });
    await expect(sure.getByRole('region', { name: 'Maker and checker' })).toContainText('Maker and checker are different people');
    await sure.getByRole('textbox', { name: /Type APPROVE/ }).fill(`APPROVE KFPL ${last}`);
    await sure.getByRole('button', { name: 'Approve and lock' }).click();
    await expect(run(approver).getByRole('button', { name: 'Approve and lock' })).toHaveCount(0, { timeout: 30_000 });
    await approver.context().close();
  }

  // Suresh makes the bank file; Meena (not its maker) releases it.
  await suresh.reload();
  await expect(run(suresh).getByText('Approved and locked').first()).toBeVisible({ timeout: 30_000 });
  await suresh.getByRole('tab', { name: /^Files/ }).click();
  const files = run(suresh).getByRole('table', { name: 'Run files' });
  await files.getByRole('button', { name: 'Make bank file' }).click();
  const make = suresh.getByRole('dialog', { name: 'Make the bank file' });
  await make.getByRole('textbox', { name: /Company account the bank debits/ }).fill('0050200012345678');
  await make.getByRole('button', { name: 'Make bank file' }).click();
  const bank = files.getByRole('row', { name: /^Bank file #\d+/ });
  await expect(bank).toContainText('Someone else releases it', { timeout: 30_000 });
  await shot(suresh, '5j-bank-file');
  const payments = Number((await bank.textContent())!.match(/(\d+) payments/)![1]);
  const meena = await as(browser, 'payroll-approver@demo-org.test');
  await meena.goto(runUrl);
  await meena.getByRole('tab', { name: /^Files/ }).click();
  const meenaBank = run(meena).getByRole('table', { name: 'Run files' }).getByRole('row', { name: /^Bank file #\d+/ });
  await meenaBank.getByRole('button', { name: 'Release' }).click();
  const release = meena.getByRole('dialog', { name: /^Release bank file #\d+$/ });
  await release.getByRole('textbox', { name: /Type RELEASE/ }).fill(`RELEASE ${payments}`);
  await release.getByRole('button', { name: 'Release bank file' }).click();
  await expect(meenaBank).toContainText('Released', { timeout: 30_000 });

  // Suresh publishes the payslips (he is the only eligible approver here, so he gives a reason).
  await suresh.reload();
  await suresh.getByRole('tab', { name: /^Files/ }).click();
  const slipsRow = run(suresh).getByRole('table', { name: 'Run files' }).getByRole('row', { name: /^Payslips \d+ payslips/ });
  const count = (await slipsRow.textContent())!.match(/(\d+) payslips/)![1];
  await slipsRow.getByRole('button', { name: 'Publish' }).click();
  const publish = suresh.getByRole('dialog', { name: `Publish ${lastText} payslips` });
  await publish.getByRole('textbox', { name: /^Reason/ }).fill('Only payroll admin on duty this month');
  await publish.getByRole('textbox', { name: /Type PUBLISH/ }).fill(`PUBLISH ${count}`);
  await publish.getByRole('button', { name: 'Publish payslips' }).click();
  await expect(slipsRow).toContainText('Published', { timeout: 30_000 });
  await shot(suresh, '5j-published');

  // Kavya makes the PF file, records the upload and files it: the month locks as filed.
  const kavya = await as(browser, 'compliance@demo-org.test');
  await kavya.goto('/yx/payroll/statutory');
  await expect(kavya.getByRole('heading', { name: 'Statutory hub', level: 1 })).toBeVisible({ timeout: 30_000 });
  await shot(kavya, '5j-filings-hub');
  const pf = kavya.getByRole('article', { name: `PF (ECR), ${lastText}` });
  const progress = pf.getByRole('list', { name: 'PF (ECR) progress' });
  await pf.getByRole('button', { name: 'Generate file' }).click();
  await expect(progress.getByRole('listitem').filter({ hasText: 'Generate file' })).toContainText('done', { timeout: 30_000 });
  await pf.getByRole('button', { name: 'Mark uploaded' }).click();
  const uploaded = kavya.getByRole('dialog', { name: 'Uploaded on the portal' });
  await uploaded.getByRole('textbox', { name: /Portal reference/ }).fill('TRRN-5554443');
  await uploaded.getByRole('button', { name: 'Save' }).click();
  await expect(progress.getByRole('listitem').filter({ hasText: 'Mark uploaded' })).toContainText('done', { timeout: 30_000 });
  await pf.getByRole('button', { name: 'Mark filed' }).click();
  const filed = kavya.getByRole('dialog', { name: `Mark PF for ${lastText} as filed` });
  await filed.getByRole('textbox', { name: /Type FILED/ }).fill(`FILED PF ${last}`);
  await filed.getByRole('button', { name: 'Mark filed' }).click();
  await expect(progress.getByRole('listitem').filter({ hasText: 'Filed (locked)' })).toContainText('done', { timeout: 30_000 });
  await expect(pf).toContainText('Portal reference TRRN-5554443');

  // Arjun sees his payslip, every line explained.
  const arjun = await as(browser, 'arjun@demo-org.test');
  await arjun.goto('/yx/me/payslips');
  await expect(arjun.getByRole('heading', { name: `Payslip for ${lastText}`, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(arjun.getByRole('region', { name: 'Earnings' })).toContainText('Basic');
  await expect(arjun.getByRole('region', { name: 'Reimbursements' })).toBeVisible();
  await shot(arjun, '5j-my-payslip');
});
