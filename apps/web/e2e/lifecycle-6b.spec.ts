import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Lifecycle batch 6b, main flow on the seeded Kaveri Foods demo: Lakshmi (HR) adds a joiner who starts today, issues
// the appointment letter from the checklist; as she is also the signatory, the System Admin approves it; the letter is
// issued with its number, the checklist's letter task closes by itself, the public check page says it is current;
// Lakshmi marks the joiner as joined (with the identity check) and they appear in the directory.
// The joining portal itself needs the one-time code by email; it is covered by the API e2e (lifecycle-6b.e2e-spec.ts).
//
// Needs the API and web against the seeded database (locally: API on 3901, web on 3900 with
// NEXT_PUBLIC_API_BASE=http://localhost:3901/api/v1, WEB_BASE_URL=http://localhost:3900), letters through the
// laptop converter (LETTER_PDF_CONVERTER=dev-fake) or Gotenberg.

const PASSWORD = 'Passw0rd!2026';

async function signedIn(browser: import('@playwright/test').Browser, email: string, password = PASSWORD) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}

async function pick(page: import('@playwright/test').Page, scope: import('@playwright/test').Locator, label: string, option: RegExp) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

test('HR issues the appointment letter → the System Admin approves → issued and checkable → the joiner joins', async ({ browser }) => {
  test.setTimeout(300_000);
  const first = `Asha${Date.now().toString(36)}`;
  const hr = await signedIn(browser, 'hr@demo-org.test');
  await hr.goto('/yx/people/onboarding');
  await hr.getByRole('button', { name: 'Add joiner' }).click();
  const sheet = hr.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /First name/ }).fill(first);
  await sheet.getByRole('textbox', { name: /Last name/ }).fill('Rao');
  const today = new Date(Date.now() + 330 * 60_000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  await sheet.getByRole('textbox', { name: 'Joining day' }).fill(today);
  await sheet.getByRole('textbox', { name: 'Joining day' }).press('Tab');
  await pick(hr, sheet, 'Legal entity', /Tamil Nadu/);
  await pick(hr, sheet, 'Location', /Hosur/);
  await pick(hr, sheet, 'Department', /Production/);
  await pick(hr, sheet, 'Designation', /Supervisor|Operator|Inspector/);
  await pick(hr, sheet, 'Employment type', /Permanent/);
  await pick(hr, sheet, 'Manager', /Divya Raghunathan/);
  await sheet.getByRole('button', { name: 'Add joiner' }).click();
  await expect(hr.getByText(`${first} was added`)).toBeVisible({ timeout: 30_000 });
  await hr.getByRole('row', { name: new RegExp(first) }).getByRole('button', { name: 'Checklist' }).click();
  await hr.waitForURL(/\/yx\/people\/onboarding\/[^/]+$/);
  const checklist = hr.url();

  // Issue the appointment letter from its task (it needs approval).
  await hr.getByRole('row', { name: /Issue the appointment letter/ }).getByRole('button', { name: 'Issue letter' }).click();
  await hr.getByRole('dialog').getByRole('button', { name: 'Issue letter' }).click();
  await expect(hr.getByRole('dialog')).toHaveCount(0);

  // Lakshmi signs letters herself, so the System Admin approves it.
  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/approvals');
  const card = admin.locator('section').filter({ has: admin.getByRole('heading', { name: /Appointment letter to approve/ }) }).last();
  await expect(card).toBeVisible();
  await expect(card.getByText(new RegExp(first))).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);

  // Issued: in the register with its reference, and the checklist task closed by itself.
  await expect(async () => {
    await hr.goto('/yx/people/letters');
    await expect(hr.getByRole('row', { name: new RegExp(`${first}.*Issued|Issued.*${first}`) })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
  const row = hr.getByRole('row', { name: new RegExp(first) }).first();
  await expect(row.getByText(/\/APT\/\d{4}\/\d{6}/)).toBeVisible();
  const checkHref = await row.getByRole('link', { name: 'Check page' }).getAttribute('href');
  const check = await (await browser.newContext()).newPage();
  await check.goto(checkHref!);
  await check.getByRole('button', { name: 'Check' }).click();
  await expect(check.getByText(/Appointment letter/)).toBeVisible();
  await expect(check.getByText(/current|valid/i).first()).toBeVisible();
  await expect(async () => {
    await hr.goto(checklist);
    await hr.getByRole('radio', { name: 'All tasks' }).click();
    await expect(hr.getByRole('row', { name: /Issue the appointment letter/ }).getByText('Done', { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  // Mark joined with the identity check: an employee now.
  await hr.getByRole('button', { name: 'Mark joined' }).click();
  const join = hr.getByRole('dialog');
  await join.getByRole('checkbox', { name: /original ID/ }).click();
  await join.getByRole('button', { name: 'Mark joined' }).click();
  await expect(join).toHaveCount(0, { timeout: 30_000 });
  await hr.goto('/yx/people/directory');
  await hr.getByRole('searchbox').first().fill(first);
  await expect(hr.getByText(new RegExp(`${first} Rao`)).first()).toBeVisible({ timeout: 30_000 });
});
