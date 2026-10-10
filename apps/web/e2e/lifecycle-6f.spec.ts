import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';
import { endFirstDays, startFirstDays } from './fixtures/life-db';

// Lifecycle batch 6f on the seeded Kaveri Foods demo. Lakshmi (HR) copies the New manager life-event starter (it
// starts Not in use), turns it on and sees the Life events list. Kavya, a recent joiner (her joining checklist is a
// fixture), lands on My first 30 days after sign-in and acknowledges her first read step. The starts themselves
// (first-time manager, transfer, parental leave, return to work) and survey privacy run in the API e2e.

const PASSWORD = 'Passw0rd!2026';

test('HR turns on a life-event checklist → a new hire lands on My first 30 days and reads a step', async ({ browser }) => {
  test.setTimeout(240_000);
  const hr = await (await browser.newContext()).newPage();
  await signIn(hr, 'hr@demo-org.test', PASSWORD);
  await hr.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('hr@demo-org.test');

  // Settings › Checklists › Life events: copy the starter once (Not in use), then turn it on.
  await hr.goto('/yx/settings/checklists');
  await hr.getByRole('radio', { name: 'Life events' }).click();
  const starter = hr.getByRole('button', { name: 'Use this starter' }).first();
  const copied = hr.getByText(/^New manager · \d+ tasks/);
  await expect(starter.or(copied).first()).toBeVisible({ timeout: 30_000 });
  if (!(await copied.count())) {
    await hr.locator('section', { has: hr.getByRole('heading', { name: 'New manager (starter)' }) }).getByRole('button', { name: 'Use this starter' }).click();
    await expect(hr.getByText(/^New manager · \d+ tasks · Not in use/)).toBeVisible({ timeout: 30_000 });
  }
  if (await hr.getByText(/^New manager · \d+ tasks · Not in use/).count()) {
    await hr.locator('section', { has: hr.getByText(/^New manager · \d+ tasks/) }).getByRole('button', { name: 'Edit checklist' }).click();
    const sheet = hr.getByRole('dialog');
    await sheet.getByRole('checkbox', { name: 'In use: starts by itself for each new manager' }).click();
    await sheet.getByRole('button', { name: 'Save checklist' }).click();
    await expect(sheet).toHaveCount(0, { timeout: 30_000 });
  }
  await expect(hr.getByText(/^New manager · \d+ tasks · In use/)).toBeVisible();

  await hr.goto('/yx/people/life-events');
  await expect(hr.getByRole('heading', { name: 'Life events' })).toBeVisible();

  // Kavya joined three days ago: she lands on My first 30 days and reads her first step.
  const title = `How things work here ${Date.now().toString(36)}`;
  const journeyId = await startFirstDays('kavya@demo-org.test', 2, title);
  try {
    const kavya = await (await browser.newContext()).newPage();
    await signIn(kavya, 'kavya@demo-org.test', PASSWORD);
    await kavya.waitForURL(/\/yx\/me\/first-30-days/, { timeout: 30_000 });
    await expect(kavya.getByText(/^Day 3 of 30\./)).toBeVisible({ timeout: 30_000 });
    const today = kavya.locator('section', { has: kavya.getByRole('heading', { name: 'Today' }) });
    await today.getByRole('row', { name: new RegExp(title) }).getByRole('button', { name: 'Read' }).click();
    const dlg = kavya.getByRole('dialog');
    await expect(dlg.getByText('Working hours, leave and holidays are in YukthiX under Time.')).toBeVisible();
    await dlg.getByRole('button', { name: 'I have read this' }).click();
    await expect(dlg).toHaveCount(0, { timeout: 30_000 });
    await expect(today.getByText('Nothing for today.')).toBeVisible({ timeout: 30_000 });
  } finally {
    await endFirstDays(journeyId);
  }
});
