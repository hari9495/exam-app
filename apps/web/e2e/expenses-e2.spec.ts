import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Expenses batch E2 on the seeded Kaveri Foods demo, with the API on EXPENSE_OCR_ADAPTER=dev-fake (the fake reader
// takes the receipt's lines from its file name). Murugan snaps a hotel receipt, checks the values read from it and
// sends the claim; Kavya, his manager, approves less with a reason; Murugan sees "Approved ₹3,500.00 of ₹4,000.00".
// Each run makes its own claim and receipt, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('snap a receipt → confirm → send; the manager approves less with a reason', async ({ browser }) => {
  test.setTimeout(240_000);
  const tag = Date.now().toString(36);
  const ist = new Date(Date.now() + 330 * 60_000 - 2 * 86_400_000).toISOString().slice(0, 10);
  const dmy = `${ist.slice(8, 10)}-${ist.slice(5, 7)}-${ist.slice(0, 4)}`;

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

  // Murugan: a claim, a snapped receipt read into a line he confirms, then sent.
  const mu = await (await browser.newContext()).newPage();
  await signIn(mu, 'murugan@demo-org.test', PASSWORD);
  await mu.waitForURL((url) => !url.pathname.includes('sign-in'));
  await mu.goto('/yx/expenses');
  await mu.getByRole('button', { name: 'New claim' }).click();
  await mu.getByRole('textbox', { name: /What is it for/ }).fill(`Mumbai visit ${tag}`);
  await mu.getByRole('button', { name: 'Start claim' }).click();
  await mu.waitForURL(/\/yx\/expenses\/claims\//);
  // Add a line: a snapped receipt is read into a line he checks and confirms.
  await mu.getByRole('button', { name: 'Add line' }).click();
  await mu.getByRole('dialog', { name: 'Add a line' }).locator('input[type=file]').setInputFiles({ name: `receipt__Hotel Sea View__Date ${dmy}__Grand Total 4,000.00.png`, mimeType: 'image/png', buffer: Buffer.concat([PNG, Buffer.from(randomUUID())]) });
  const read = mu.getByRole('article', { name: /^Line 1, / });
  await expect(read.getByText('Check the values read from the receipt')).toBeVisible({ timeout: 30_000 });
  await read.getByRole('button', { name: 'Check and confirm' }).click();
  const sheet = mu.getByRole('dialog', { name: 'Line 1' });
  await sheet.getByRole('combobox', { name: 'What is it for' }).click();
  await mu.getByRole('option', { name: 'Hotel and lodging' }).click();
  await sheet.getByRole('textbox', { name: /City/ }).fill('Mumbai');
  await expect(sheet.getByRole('textbox', { name: /Amount/ })).toHaveValue(/^4,?000(\.00)?$/);
  await sheet.getByRole('button', { name: 'Confirm line' }).click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  await expect(mu.getByRole('article', { name: 'Line 1, Hotel and lodging' })).toBeVisible();
  // The receipt's virus check runs in the background: submitting waits for it.
  await expect(async () => {
    await mu.getByRole('button', { name: 'Submit claim' }).click();
    await expect(mu.getByRole('list', { name: 'Approval steps' }).getByRole('listitem').filter({ hasText: 'Manager' })).toContainText('Waiting', { timeout: 3_000 });
  }).toPass({ timeout: 60_000 });

  // Kavya: the claim waits for her; she approves ₹3,500 with a reason.
  const kv = await (await browser.newContext()).newPage();
  await signIn(kv, 'kavya@demo-org.test', PASSWORD);
  await kv.waitForURL((url) => !url.pathname.includes('sign-in'));
  await kv.goto('/yx/expenses');
  await kv.getByRole('radio', { name: 'Waiting for me' }).click();
  await kv.getByRole('listitem').filter({ hasText: `Mumbai visit ${tag}` }).getByRole('button', { name: 'Review expense for Murugan Selvam' }).click();
  await kv.waitForURL(/\/yx\/expenses\/claims\//);
  await kv.getByRole('table', { name: 'Claim lines' }).getByRole('row', { name: /Hotel and lodging/ }).getByRole('button', { name: 'Reduce' }).click();
  const dlg = kv.getByRole('dialog', { name: 'Reduce the approved amount' });
  const approve = dlg.getByRole('textbox', { name: /Approve/ });
  await approve.click();
  await approve.press('ControlOrMeta+a');
  await approve.pressSequentially('3500');
  await dlg.getByRole('textbox', { name: /Reason/ }).fill('Hotel cap for this visit');
  await expect(dlg.getByRole('status')).toContainText('Approved ₹3,500.00');
  await dlg.getByRole('button', { name: 'Save reduction' }).click();
  await expect(dlg).toHaveCount(0, { timeout: 30_000 });
  await kv.getByRole('button', { name: 'Approve with changes' }).click(); // the reduction is part of the approval
  await expect(kv.getByText('Partly approved').first()).toBeVisible({ timeout: 30_000 });

  // Murugan sees what was approved and why.
  await mu.reload();
  await expect(mu.getByText('Approved ₹3,500.00 of ₹4,000.00')).toBeVisible({ timeout: 30_000 });
  await expect(mu.getByText('Hotel cap for this visit').first()).toBeVisible();
});
