import { expect, test, type APIRequestContext } from '@playwright/test';
import { setCompanySetting } from './fixtures/pay-db';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Expenses batch E3 on the seeded Kaveri Foods demo (XP-3.08): the company pays claims by bank transfer. Murugan's
// mileage claim is approved by Kavya; the admin (finance) puts it in a bank file; the second admin, someone else,
// releases it with step-up and the phrase; the admin records the bank's result; Murugan sees it paid, and a paid
// line can no longer be changed (YX-EXP-12). Each run makes its own claim.
//
// Needs the API and web against a seeded database (locally: API on 3801, web on 3800, E2E_DATABASE_URL for step-up).

const PASSWORD = 'Passw0rd!2026';
const API = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3801/api/v1';

async function login(request: APIRequestContext, email: string, password = PASSWORD) {
  const r = await request.post(`${API}/auth/staff/login`, { data: { organizationSlug: 'demo-org', email, password } });
  expect(r.ok()).toBe(true);
  return { Authorization: `Bearer ${(await r.json()).accessToken as string}` };
}

test('finance pays an approved claim by bank file, released by someone else; the paid claim is locked', async ({ browser, request }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  await setCompanySetting('demo-org', 'expense.route.default', 'payout');

  // The company has its expense set-up (the YukthiX starters).
  const adminApi = await login(request, 'admin@demo-org.test', 'DevAdmin123!');
  await request.post(`${API}/expenses/setup/from-starter`, { headers: adminApi });

  // Murugan claims his mileage; Kavya approves it.
  const mu = await login(request, 'murugan@demo-org.test');
  let claim = await (await request.post(`${API}/expenses/claims`, { headers: mu, data: { title: `Dealer visits ${tag}` } })).json();
  claim = await (await request.post(`${API}/expenses/claims/${claim.id}/lines`, { headers: mu, data: { payMode: 'personal', spentOn: day(-3), categoryCode: 'mileage', mileage: { vehicle: 'car', km: 42, from: 'Office', to: 'Dealer' } } })).json();
  const submitted = await request.post(`${API}/expenses/claims/${claim.id}/submit`, { headers: mu, data: { version: claim.version } });
  expect(submitted.ok()).toBe(true);
  const kv = await login(request, 'kavya@demo-org.test');
  expect((await request.post(`${API}/expenses/claims/${claim.id}/decide`, { headers: kv, data: { decision: 'approve' } })).ok()).toBe(true);

  // The admin (finance) puts it in a bank file.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));
  await admin.goto('/yx/expenses/to-pay');
  await expect(admin.getByRole('heading', { name: 'To pay' })).toBeVisible({ timeout: 30_000 });
  const row = admin.getByRole('row', { name: new RegExp(`Dealer visits ${tag}`) });
  await row.getByRole('checkbox').check();
  await admin.getByRole('button', { name: 'Pay by bank file' }).click();
  await admin.getByRole('textbox', { name: /Pay from account/ }).fill('00123456789');
  await admin.getByRole('button', { name: 'Make bank file' }).click();
  await expect(admin.getByText(/Bank file made: 1 payment/)).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('tab', { name: /Bank files/ }).click();
  await expect(admin.getByText('Someone else releases it.').first()).toBeVisible();

  // The second admin, someone else, releases it with step-up and the phrase.
  const neha = await (await browser.newContext()).newPage();
  await signIn(neha, 'admin2@demo-org.test', 'DevAdmin123!');
  await neha.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('admin2@demo-org.test');
  await neha.goto('/yx/expenses/to-pay');
  await neha.getByRole('tab', { name: /Bank files/ }).click();
  await neha.getByRole('button', { name: 'Release' }).first().click();
  await neha.getByRole('textbox', { name: /Type/ }).fill('RELEASE 1');
  await neha.getByRole('dialog').getByRole('button', { name: 'Release' }).click();
  await expect(neha.getByText('Sent to the bank').first()).toBeVisible({ timeout: 30_000 });

  // The admin records the bank's result.
  await admin.reload();
  await admin.getByRole('tab', { name: /Bank files/ }).click();
  await admin.getByRole('button', { name: 'Record results' }).first().click();
  const results = admin.getByRole('dialog');
  await results.getByRole('textbox', { name: /Bank reference/ }).first().fill(`UTR-${tag}`);
  await results.getByRole('button', { name: 'Record results' }).click();
  await expect(admin.getByText('Settled').first()).toBeVisible({ timeout: 30_000 });

  // Murugan sees it paid; a paid line can no longer be changed (YX-EXP-12).
  const after = await (await request.get(`${API}/expenses/claims/${claim.id}`, { headers: mu })).json();
  expect(after).toMatchObject({ paymentStatus: 'paid', payment: { route: 'payout' } });
  const muPage = await (await browser.newContext()).newPage();
  await signIn(muPage, 'murugan@demo-org.test', PASSWORD);
  await muPage.waitForURL((url) => !url.pathname.includes('sign-in'));
  await muPage.goto(`/yx/expenses/claims/${claim.id}`);
  await expect(muPage.getByText(/Paid on .* to your bank account\./)).toBeVisible({ timeout: 30_000 });
  const line = after.lines[0];
  const edit = await request.put(`${API}/expenses/claims/${claim.id}/lines/${line.id}`, { headers: mu, data: { payMode: 'personal', spentOn: day(-3), categoryCode: 'mileage', mileage: { vehicle: 'car', km: 50, from: 'Office', to: 'Dealer' }, version: line.version } });
  expect(edit.ok()).toBe(false);
  await setCompanySetting('demo-org', 'expense.route.default', 'payroll');
});
