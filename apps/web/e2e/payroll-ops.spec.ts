import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { openProofWindow } from './fixtures/pay-db';
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
  await expect(arjun.getByRole('heading', { name: 'My tax declarations' })).toBeVisible({ timeout: 30_000 });
  await arjun.getByRole('button', { name: 'Declare' }).click();
  await arjun.getByRole('combobox', { name: /What/ }).click();
  await arjun.getByRole('option', { name: 'Investments and payments (80C)' }).click();
  await arjun.getByRole('textbox', { name: /Amount for the year/ }).fill('50000');
  await arjun.getByRole('button', { name: 'Save' }).click();
  const row = arjun.getByRole('row', { name: /Investments and payments/ });
  await expect(row).toContainText('₹50,000.00');
  await row.locator('input[type=file]').setInputFiles({ name: 'ppf-statement.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(row).toContainText('Proof being checked');

  await arjun.goto('/yx/me/loans');
  await arjun.getByRole('button', { name: 'Ask for an advance or loan' }).first().click();
  await arjun.getByRole('textbox', { name: /Amount/ }).fill('20000');
  await arjun.getByRole('textbox', { name: /Instalments/ }).fill('4');
  await arjun.getByLabel(/First instalment in/).fill(next);
  await arjun.getByRole('textbox', { name: /Why/ }).fill('School fees for the new term');
  await arjun.getByRole('button', { name: 'Send for approval' }).click();
  await expect(arjun.getByRole('table', { name: 'Loans and advances' })).toContainText('Waiting for approval');

  // Suresh accepts part of the proof with a reason.
  const suresh = await as(browser, 'payroll@demo-org.test');
  await suresh.goto('/yx/payroll/proofs');
  await expect(suresh.getByRole('heading', { name: 'Proof checking' })).toBeVisible({ timeout: 30_000 });
  await suresh.getByRole('button', { name: /^Decide on Arjun/ }).click();
  await suresh.getByRole('radio', { name: 'Accept part' }).click();
  await suresh.getByRole('textbox', { name: /Amount accepted/ }).fill('30000');
  await suresh.getByRole('textbox', { name: /Comment/ }).fill('Only the PPF deposit is this year');
  await suresh.getByRole('button', { name: 'Save decision' }).click();
  await expect(suresh.getByRole('button', { name: /^Decide on Arjun/ })).toHaveCount(0);
  await suresh.getByRole('radio', { name: 'Partly accepted' }).click();
  await expect(suresh.getByRole('table', { name: 'Proofs' })).toContainText('₹30,000.00 accepted');

  // The advance waits for the approver; Suresh asks for a cash payment mode for someone else.
  await suresh.goto('/yx/payroll/loans');
  await expect(suresh.getByRole('table', { name: 'Loans and advances' })).toContainText('Waiting for approval');
  await suresh.goto('/yx/payroll/payment-modes');
  await suresh.getByRole('button', { name: 'Ask for a payment mode' }).click();
  await suresh.getByRole('textbox', { name: /Find person/ }).fill('Arjun');
  await suresh.getByRole('button', { name: 'Search', exact: true }).click();
  await suresh.getByRole('button', { name: /Arjun/ }).first().click();
  await suresh.getByLabel(/^From/).fill(`${next}-01`);
  await suresh.getByRole('textbox', { name: /Why/ }).fill('Bank account frozen');
  await suresh.getByRole('button', { name: 'Send for approval' }).click();
  await expect(suresh.getByRole('table', { name: 'Payment modes' })).toContainText('Waiting for approval');
  await suresh.goto('/yx/payroll/payslip-queries');
  await expect(suresh.getByRole('heading', { name: 'Payslip queries' })).toBeVisible();
  await suresh.goto('/yx/payroll/certificates');
  await expect(suresh.getByRole('heading', { name: 'Tax certificates' })).toBeVisible();

  // Arjun sees the part acceptance and its reason.
  await arjun.goto('/yx/me/tax-declarations');
  await expect(arjun.getByRole('row', { name: /Investments and payments/ })).toContainText('Only the PPF deposit is this year');

  // Kavya opens the month's registers and the advisories.
  const kavya = await as(browser, 'compliance@demo-org.test');
  await kavya.goto('/yx/payroll/registers');
  await expect(kavya.getByRole('heading', { name: 'Statutory registers' })).toBeVisible({ timeout: 30_000 });
  await expect(kavya.getByRole('button', { name: 'Make registers' })).toBeVisible();
  await kavya.goto('/yx/payroll/advisories');
  await expect(kavya.getByRole('heading', { name: 'Compliance advisories' })).toBeVisible();
});
