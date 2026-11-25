import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { openProofWindow, setOldRegime } from './fixtures/pay-db';
import { stepUp } from './fixtures/time-db';

// Payroll operations screens (PAY-10.09 … 10.16) on the seeded Kaveri Foods demo: Arjun declares 80C with a proof and asks
// for a salary advance; Suresh (Payroll Admin) accepts part of the proof, sees the advance waiting for approval and asks
// for a cash payment mode; Kavya (Compliance Owner) opens the registers and the advisories.
//
// Needs the API and web against a freshly seeded database (locally: API on 3801, web on 3800, E2E_DATABASE_URL for step-up).

const PASSWORD = 'Passw0rd!2026';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n');
const next = (() => {
  const d = new Date(Date.now() + 330 * 60_000);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 7);
})();

async function as(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}

test('declarations and proofs, an advance, a payment mode, registers and advisories', async ({ browser }) => {
  test.setTimeout(240_000);

  // HR has opened the proof window (a company setting); Arjun declares 80C and sends a proof, then asks for an advance.
  await openProofWindow('demo-org');
  const arjun = await as(browser, 'arjun@demo-org.test');
  await arjun.goto('/yx/me/tax-declarations');
  const tax = arjun.locator('main').last();
  await expect(tax.getByRole('heading', { name: /^Tax workspace · / })).toBeVisible({ timeout: 30_000 });
  await arjun.getByRole('tab', { name: /^Declarations/ }).click();
  await tax.getByRole('button', { name: 'Add declaration' }).click();
  const declare = arjun.getByRole('dialog', { name: 'Add declaration' });
  await declare.getByRole('combobox', { name: /What/ }).click();
  await arjun.getByRole('option', { name: 'Investments and payments · s.123, Sch XV (old 80C)' }).click();
  await declare.getByRole('textbox', { name: /Amount for the year/ }).fill('50000');
  await declare.getByRole('button', { name: 'Save declaration' }).click();
  await expect(tax.getByRole('table', { name: 'Declarations' }).getByRole('row', { name: /Investments and payments/ })).toContainText('₹50,000.00', { timeout: 30_000 });
  // Proofs are asked only in the old regime (PAY-22 design). Arjun's workspace (made on his first visit) starts in the new
  // one; put it in the old regime, as an HR override would.
  await setOldRegime('arjun@demo-org.test');
  await arjun.reload();
  await arjun.getByRole('tab', { name: 'Proofs' }).click();
  const proof = tax.getByRole('list', { name: 'Proofs' }).getByRole('listitem').filter({ hasText: 'Investments and payments' });
  await proof.locator('input[type=file]').setInputFiles({ name: 'ppf-statement.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(proof).toContainText('Proof being checked', { timeout: 30_000 });

  await arjun.goto('/yx/me/loans');
  const ask = arjun.getByRole('region', { name: 'Ask for a loan or advance' });
  await ask.getByRole('textbox', { name: /^Amount/ }).fill('20000');
  await ask.getByRole('textbox', { name: /Number of instalments/ }).fill('4');
  await ask.getByRole('textbox', { name: /First instalment in/ }).fill(next);
  await ask.getByRole('textbox', { name: /^Reason/ }).fill('School fees for the new term');
  await ask.getByRole('button', { name: 'Send request' }).click();
  await expect(arjun.getByRole('table', { name: 'Loans and advances' })).toContainText('Waiting for approval', { timeout: 30_000 });

  // Suresh accepts part of the proof with a reason.
  const suresh = await as(browser, 'payroll@demo-org.test');
  await suresh.goto('/yx/payroll/proofs');
  await expect(suresh.getByRole('heading', { name: 'Proof verification' })).toBeVisible({ timeout: 30_000 });
  const lines = suresh.getByRole('table', { name: 'Proof lines' });
  await lines.getByRole('row').filter({ hasText: 'Arjun' }).filter({ hasText: 'Investments and payments' }).getByRole('button', { name: 'Decide' }).click();
  const decide = suresh.getByRole('dialog', { name: 'Investments and payments (80C)' });
  await decide.getByRole('radio', { name: 'Approve part' }).click();
  // Approving part needs the amount and a comment the employee sees.
  await decide.getByRole('textbox', { name: /Approved amount/ }).fill('30000');
  await decide.getByRole('textbox', { name: /Comment to employee/ }).fill('Only the PPF deposit is this year');
  await decide.getByRole('button', { name: 'Approve part' }).click();
  await expect(decide).toHaveCount(0, { timeout: 30_000 });
  await suresh.getByRole('radio', { name: 'Partly approved' }).click();
  await expect(lines.getByRole('row').filter({ hasText: 'Arjun' })).toContainText('₹30,000.00', { timeout: 30_000 });

  // The advance waits for the approver; Suresh asks for a cash payment mode for someone else.
  await suresh.goto('/yx/payroll/loans');
  await expect(suresh.getByRole('table', { name: 'Loans and advances' })).toContainText('Waiting for approval');
  await suresh.goto('/yx/payroll/payment-modes');
  await suresh.getByRole('button', { name: 'Ask for a payment mode' }).click();
  const mode = suresh.getByRole('dialog', { name: 'Ask for a payment mode' });
  await mode.getByRole('textbox', { name: /Find person/ }).fill('Arjun');
  await mode.getByRole('button', { name: 'Search', exact: true }).click();
  await mode.getByRole('button', { name: /Arjun/ }).first().click();
  await mode.getByRole('textbox', { name: /^From/ }).fill(`${next}-01`);
  await mode.getByRole('textbox', { name: /Why/ }).fill('Bank account frozen');
  await mode.getByRole('button', { name: 'Send for approval' }).click();
  await expect(suresh.getByRole('table', { name: 'Payment modes' })).toContainText('Waiting for approval');
  await suresh.goto('/yx/payroll/payslip-queries');
  await expect(suresh.getByRole('heading', { name: 'Payslip queries' })).toBeVisible();
  await suresh.goto('/yx/payroll/certificates');
  await expect(suresh.getByRole('heading', { name: /^Form 16 · tax year / })).toBeVisible({ timeout: 30_000 });

  // Arjun sees the part acceptance and its reason.
  await arjun.goto('/yx/me/tax-declarations');
  await arjun.getByRole('tab', { name: 'Proofs' }).click();
  await expect(tax.getByRole('list', { name: 'Proofs' }).getByRole('listitem').filter({ hasText: 'Investments and payments' })).toContainText('Only the PPF deposit is this year', { timeout: 30_000 });

  // Kavya opens the month's registers and the advisories.
  const kavya = await as(browser, 'compliance@demo-org.test');
  await kavya.goto('/yx/payroll/registers');
  await expect(kavya.getByRole('heading', { name: 'Statutory registers' })).toBeVisible({ timeout: 30_000 });
  await expect(kavya.getByRole('button', { name: 'Make registers' })).toBeVisible();
  await kavya.goto('/yx/payroll/advisories');
  await expect(kavya.getByRole('heading', { name: 'Rules & updates', level: 1 })).toBeVisible({ timeout: 30_000 });
});
