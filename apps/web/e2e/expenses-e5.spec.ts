import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { signIn } from './fixtures/sign-in';

// Expenses batch E5 on the seeded Kaveri Foods demo: the admin (finance) opens Expense reports, picks the GST input
// report and exports it; the CSV starts with the GSTR-2B columns.

test('expense reports: the GST input tab exports a CSV in the GSTR-2B column order', async ({ browser }) => {
  test.setTimeout(120_000);
  const admin = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await signIn(admin, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));
  await admin.goto('/yx/expenses/reports');
  await expect(admin.getByRole('heading', { name: 'Expense reports' })).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('tab', { name: 'GST input' }).click();
  await expect(admin.getByText('in the GSTR-2B column order')).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([admin.waitForEvent('download'), admin.getByRole('button', { name: 'Export CSV' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^expenses-gst-input-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await readFile(await download.path(), 'utf8');
  expect(text.split('\r\n')[0]).toMatch(/^GSTIN of supplier,Trade\/Legal name,Invoice number,Invoice type,Invoice Date,Invoice Value,Place of supply/);
});
