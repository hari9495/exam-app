import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Expenses batch E4 on the seeded Kaveri Foods demo (API on EXPENSE_OCR_ADAPTER=dev-fake). Murugan asks for a trip
// with a ₹10,000 advance; Kavya, his manager, approves it and the advance appears; the admin (finance) pays it;
// Murugan claims ₹7,000 on the trip, Kavya approves, and the trip shows ₹3,000 left on the advance to return.
// Each run makes its own trip, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

test('trip with an advance → claim on the trip → the advance is settled and the rest is to return', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const from = day(-6);
  const to = day(-2);
  const dmy = `${from.slice(8, 10)}-${from.slice(5, 7)}-${from.slice(0, 4)}`;

  // The company has its expense set-up (the YukthiX starters), copied once.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('admin@demo-org.test');
  await admin.goto('/yx/settings/expenses');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('tab', { name: 'Limits' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(admin.getByRole('tab', { name: 'Limits' })).toBeVisible({ timeout: 30_000 });

  // Murugan asks for the trip.
  const mu = await (await browser.newContext()).newPage();
  await signIn(mu, 'murugan@demo-org.test', PASSWORD);
  await mu.waitForURL((url) => !url.pathname.includes('sign-in'));
  await mu.goto('/yx/expenses');
  await mu.getByRole('button', { name: 'Trips' }).click();
  await mu.waitForURL(/\/yx\/expenses\/trips$/);
  await mu.getByRole('button', { name: 'Request a trip' }).click();
  const sheet = mu.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /Purpose/ }).fill(`Pune meetings ${tag}`);
  await sheet.getByRole('textbox', { name: 'Trip starts' }).fill(shown(from));
  await sheet.getByRole('textbox', { name: 'Trip starts' }).press('Enter');
  await sheet.getByRole('textbox', { name: 'Trip ends' }).fill(shown(to));
  await sheet.getByRole('textbox', { name: 'Trip ends' }).press('Enter');
  await sheet.getByRole('textbox', { name: /Leg 1: from/ }).fill('Chennai');
  await sheet.getByRole('textbox', { name: /^To/ }).fill('Pune');
  await sheet.getByRole('textbox', { name: 'Leg 1 date' }).fill(shown(from));
  await sheet.getByRole('textbox', { name: 'Leg 1 date' }).press('Enter');
  await sheet.getByRole('textbox', { name: /Estimated cost/ }).fill('20000');
  await sheet.getByRole('textbox', { name: /Advance needed/ }).fill('10000');
  await sheet.getByRole('button', { name: 'Send for approval' }).click();
  await mu.waitForURL(/\/yx\/expenses\/trips\/[0-9a-f-]+$/, { timeout: 30_000 });
  await expect(mu.getByText('With approvers')).toBeVisible({ timeout: 30_000 });
  const tripUrl = mu.url();

  // Kavya approves it; the approval creates the advance.
  const kv = await (await browser.newContext()).newPage();
  await signIn(kv, 'kavya@demo-org.test', PASSWORD);
  await kv.waitForURL((url) => !url.pathname.includes('sign-in'));
  await kv.goto('/yx/expenses/trips');
  await kv.getByRole('radio', { name: /Waiting for me/ }).click();
  await kv.getByRole('row', { name: new RegExp(`Pune meetings ${tag}`) }).getByRole('button', { name: 'Open' }).click();
  await kv.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(kv.getByText('Approved', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // Finance (the admin) pays the advance.
  await mu.reload();
  await mu.getByRole('button', { name: 'Open the advance' }).click();
  await mu.waitForURL(/\/yx\/expenses\/advances\//);
  const advanceUrl = mu.url();
  await admin.goto(advanceUrl);
  await admin.getByRole('button', { name: 'Record payment' }).click();
  const pay = admin.getByRole('dialog');
  await pay.getByRole('textbox', { name: /Bank reference/ }).fill(`NEFT-${tag}`);
  await pay.getByRole('button', { name: 'Record payment' }).click();
  await expect(admin.getByText('Advance paid')).toBeVisible({ timeout: 30_000 });

  // Murugan claims ₹7,000 on the trip.
  await mu.goto(tripUrl);
  await mu.getByRole('button', { name: 'Add a claim to this trip' }).click();
  await mu.waitForURL(/\/yx\/expenses\/claims\//);
  await mu.getByLabel('Snap or upload a receipt').setInputFiles({ name: `receipt__Air India__Date ${dmy}__Grand Total 7,000.00.png`, mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.from(randomUUID())]) });
  await expect(mu.getByText('Check the values read from the receipt')).toBeVisible({ timeout: 30_000 });
  await mu.getByRole('button', { name: 'Check and confirm' }).click();
  const line = mu.getByRole('dialog');
  await line.getByRole('combobox', { name: 'What is it for' }).click();
  await mu.getByRole('option', { name: 'Air travel' }).click();
  await line.getByRole('button', { name: 'Confirm' }).click();
  await expect(line).toHaveCount(0, { timeout: 30_000 });
  await expect(async () => {
    await mu.getByRole('button', { name: 'Send for approval' }).click();
    await expect(mu.getByText('With approvers')).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  const claimUrl = mu.url();

  await kv.goto(claimUrl);
  await kv.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(kv.getByText('Approved', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // The advance covered the claim: nothing more to receive, ₹3,000 left to return.
  await mu.goto(tripUrl);
  await expect(mu.getByText(/return ₹3,000.00 by bank/)).toBeVisible({ timeout: 30_000 });
  await mu.goto(advanceUrl);
  await expect(mu.getByText(`Settled by claim: Pune meetings ${tag}`)).toBeVisible({ timeout: 30_000 });
});
