import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Recruitment batch AT2 on the seeded demo: the older approval settings page redirects to Hiring approvals; a
// headcount plan is made, sent for approval and approved by another admin in Approvals (never its author). Re-runs
// reuse next year's Production plan.

async function signedIn(browser: Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('hiring approvals moved; a headcount plan is approved by someone else', async ({ browser }) => {
  test.setTimeout(240_000);
  const admin = await signedIn(browser, 'admin@demo-org.test');
  await admin.goto('/v2/settings/approvals');
  await admin.waitForURL(/\/yx\/hiring\/approval-routes$/, { timeout: 30_000 });
  await expect(admin.getByRole('button', { name: 'Save requisition approval' })).toBeVisible({ timeout: 30_000 });
  await expect(admin.getByRole('button', { name: 'Save offer approval' })).toBeVisible();

  await admin.goto('/yx/hiring/plans');
  await expect(admin.getByRole('heading', { name: 'Headcount plans', level: 1 })).toBeVisible({ timeout: 30_000 });
  const years = admin.getByRole('combobox', { name: 'Financial year' });
  await years.click();
  const next = admin.getByRole('option').last();
  const nextLabel = (await next.textContent())!.trim();
  await next.click();
  const card = admin.getByText(`Production · ${nextLabel}`);
  if (!(await card.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await admin.getByRole('button', { name: 'New plan' }).click();
    const d = admin.getByRole('dialog');
    await d.getByRole('combobox', { name: 'Department' }).click();
    await admin.getByRole('option', { name: /^Production/ }).first().click();
    await d.getByRole('combobox', { name: 'Plan year' }).click();
    await admin.getByRole('option', { name: nextLabel }).click();
    await d.getByRole('combobox', { name: 'Line 1: designation' }).click();
    await admin.getByRole('option').first().click();
    await d.getByRole('button', { name: 'Save' }).click();
    await expect(d).toHaveCount(0, { timeout: 30_000 });
  }
  await expect(card).toBeVisible({ timeout: 30_000 });
  const send = admin.getByRole('button', { name: 'Send for approval' }).first();
  if (await send.isVisible()) {
    await send.click();
    await expect(admin.getByText('Waiting for approval').first()).toBeVisible({ timeout: 30_000 });
  }

  const other = await signedIn(browser, 'admin2@demo-org.test');
  await other.goto('/yx/approvals');
  const waiting = other.getByText(/^Headcount plan: Production/).first().locator('xpath=ancestor::*[.//button[normalize-space()="Approve"]][1]');
  if (await waiting.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await waiting.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(waiting).toHaveCount(0, { timeout: 30_000 });
  }
  await admin.reload();
  await admin.getByRole('combobox', { name: 'Financial year' }).click();
  await admin.getByRole('option', { name: nextLabel }).click();
  await expect(admin.getByText('Approved').first()).toBeVisible({ timeout: 30_000 });
});
