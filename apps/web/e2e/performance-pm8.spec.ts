import { expect, test, type Browser } from '@playwright/test';
import { approveRequest } from './fixtures/approvals';
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
  // HR (Lakshmi, HR Admin with perf.pip.manage) approves plans and records outcomes.
  const admin = await signedIn(browser, 'hr@demo-org.test', PASSWORD);
  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);

  // A plan left open by an earlier run is closed first (one live plan per person): approved if still waiting, then met.
  await admin.goto('/yx/approvals');
  const plan = /Improvement plan: Murugan/;
  if (await admin.getByRole('row', { name: plan }).first().waitFor({ timeout: 15_000 }).then(() => true, () => false)) await approveRequest(admin, plan);
  const outcome = async (page: typeof admin, choice: 'Met' | 'Not met', note: string) => {
    await page.getByRole('tab', { name: 'Outcome' }).click();
    await page.getByRole('tabpanel', { name: 'Outcome' }).getByRole('button', { name: 'Record outcome' }).click();
    const o = page.getByRole('dialog', { name: /^Record the outcome of Murugan Selvam’s PIP\?$/ });
    await o.getByRole('radio', { name: choice, exact: true }).click();
    await o.getByRole('textbox', { name: /^Note/ }).fill(note);
    await o.getByRole('button', { name: 'Record outcome' }).click();
    await expect(o).toHaveCount(0, { timeout: 30_000 });
  };
  await admin.goto('/yx/performance/pips');
  await admin.getByRole('radio', { name: 'In my scope' }).click();
  const open = admin.getByRole('row', { name: /Murugan.*(Active|In progress|Extended)/ });
  if (await open.first().waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await open.first().getByRole('button', { name: 'Open' }).click();
    await outcome(admin, 'Met', 'Closed by an earlier test run.');
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

  await approveRequest(admin, plan);
  await admin.goto(pipUrl);
  await expect(admin.locator('main').last().getByText('Active', { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  // Murugan acknowledges: reading it, not agreeing; his comment is kept.
  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  await mu.goto(pipUrl);
  await mu.getByRole('tab', { name: 'Acknowledgement' }).click();
  const ack = mu.getByRole('tabpanel', { name: 'Acknowledgement' });
  await ack.getByRole('textbox', { name: /Your comment/ }).fill('The new line needs more time, but I will try.');
  await ack.getByRole('button', { name: 'Acknowledge plan' }).click();
  await expect(ack).toContainText(/Acknowledged on .*more time/s, { timeout: 30_000 });

  // Kavya records a check-in; a note is required.
  await kv.goto(pipUrl);
  await kv.getByRole('tab', { name: /^Check-ins/ }).click();
  await kv.getByRole('tabpanel').getByRole('button', { name: 'Record check-in' }).click();
  const ci = kv.getByRole('dialog', { name: 'Record check-in' });
  await ci.getByRole('radio', { name: 'Some progress' }).click();
  await ci.getByRole('button', { name: 'Record check-in' }).click();
  await expect(ci).toBeVisible(); // refused without the note
  await ci.getByRole('textbox', { name: /^Note/ }).fill('Two changeovers under 25 minutes this week.');
  await ci.getByRole('button', { name: 'Record check-in' }).click();
  await expect(ci).toHaveCount(0, { timeout: 30_000 });
  await expect(kv.getByRole('tabpanel')).toContainText('Two changeovers under 25 minutes this week.', { timeout: 30_000 });

  // HR records "not met": nothing else happens by itself; HR may start an exit case.
  await admin.goto(pipUrl);
  await outcome(admin, 'Not met', 'Changeovers stayed above the standard.');
  const result = admin.getByRole('tabpanel', { name: 'Outcome' });
  await expect(result).toContainText('Outcome: not met', { timeout: 30_000 });
  await expect(result).toContainText('Nothing starts automatically.');
  await expect(result.getByRole('button', { name: 'Open exit case in People' }).or(result.getByRole('link', { name: 'Open exit case in People' }))).toBeVisible();
});
