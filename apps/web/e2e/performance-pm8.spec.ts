import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM8 on the seeded Kaveri Foods demo: Kavya proposes an improvement plan for Murugan; the admin (HR)
// approves it in Approvals; Murugan acknowledges with a comment; Kavya records the first check-in; the admin records
// "not met" and the plan offers "Start an exit case" without opening one. Each run first closes Murugan's open plan, so
// the test can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('improvement plan: propose, approve, acknowledge, check in, not met', async ({ browser }) => {
  test.setTimeout(300_000);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);

  // A plan left open by an earlier run is closed first (one live plan per person): approved if still waiting, then met.
  await admin.goto('/yx/approvals');
  const waiting = admin.getByText(/^Improvement plan: Murugan/).first().locator('xpath=ancestor::*[.//button[normalize-space()="Approve"]][1]');
  if (await waiting.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await waiting.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(waiting).toHaveCount(0, { timeout: 30_000 });
  }
  await admin.goto('/yx/performance/pips');
  await admin.getByRole('radio', { name: 'In my scope' }).click();
  const open = admin.getByRole('row', { name: /Murugan.*(In progress|Extended)/ });
  if (await open.first().waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await open.first().getByRole('button', { name: 'Open' }).click();
    await admin.getByRole('button', { name: 'Record the outcome' }).click();
    await admin.getByRole('dialog').getByRole('textbox', { name: /Summary/ }).fill('Closed by an earlier test run.');
    await admin.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(admin.getByText('Met', { exact: true })).toBeVisible({ timeout: 30_000 });
  }

  await kv.goto('/yx/performance/pips');
  await kv.getByRole('button', { name: 'Propose a plan' }).click();
  const d = kv.getByRole('dialog');
  await d.getByRole('combobox', { name: 'Employee' }).click();
  await kv.getByRole('option', { name: /Murugan/ }).first().click();
  await d.getByRole('textbox', { name: /Why a plan is needed/ }).fill('Line changeovers ran over the standard time for two months.');
  await d.getByRole('textbox', { name: /What good looks like/ }).fill('Changeovers within 25 minutes on every shift.');
  await d.getByRole('textbox', { name: /Support you will give/ }).fill('Pairing with the senior operator.');
  await d.getByRole('textbox', { name: /^Goal 1/ }).fill('Faster changeovers');
  await d.getByRole('textbox', { name: /How goal 1 is measured/ }).fill('25 minutes or less, logged per shift');
  await d.getByRole('radio', { name: '30 days' }).click();
  await d.getByRole('radio', { name: 'Week', exact: true }).click();
  const on = d.getByRole('textbox', { name: 'Starts on' });
  await on.fill(shown(today));
  await on.press('Enter');
  await d.getByRole('button', { name: 'Send to HR' }).click();
  await kv.waitForURL(/\/yx\/performance\/pips\/[0-9a-f-]+$/, { timeout: 30_000 });
  const pipUrl = kv.url();
  await expect(kv.getByText('Waiting for HR')).toBeVisible({ timeout: 30_000 });

  await admin.goto('/yx/approvals');
  const card = admin.getByText(/^Improvement plan: Murugan/).first().locator('xpath=ancestor::*[.//button[normalize-space()="Approve"]][1]');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0, { timeout: 30_000 });
  await admin.goto(pipUrl);
  await expect(admin.getByText('In progress')).toBeVisible({ timeout: 30_000 });

  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  await mu.goto(pipUrl);
  await mu.getByRole('button', { name: 'Acknowledge' }).click();
  await mu.getByRole('dialog').getByRole('textbox', { name: /Your comment/ }).fill('The new line needs more time, but I will try.');
  await mu.getByRole('dialog').getByRole('button', { name: 'Acknowledge' }).click();
  await expect(mu.getByText(/Acknowledged on .*more time/)).toBeVisible({ timeout: 30_000 });

  await kv.reload();
  await kv.getByRole('button', { name: 'Record' }).first().click();
  await kv.getByRole('dialog').getByRole('textbox', { name: /What was discussed/ }).fill('Two changeovers under 25 minutes this week.');
  await kv.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(kv.getByText('Manager: Two changeovers under 25 minutes this week.')).toBeVisible({ timeout: 30_000 });

  await admin.reload();
  await admin.getByRole('button', { name: 'Record the outcome' }).click();
  const o = admin.getByRole('dialog');
  await o.getByRole('radio', { name: 'Not met' }).click();
  await o.getByRole('textbox', { name: /Summary/ }).fill('Changeovers stayed above the standard.');
  await o.getByRole('button', { name: 'Save' }).click();
  await expect(admin.getByText('Not met. Nothing else happens by itself.')).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByRole('button', { name: 'Start an exit case' })).toBeVisible();
});
