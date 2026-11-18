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
  await expect(admin.getByRole('heading', { name: 'Headcount plan', level: 1 })).toBeVisible({ timeout: 30_000 });
  // Next financial year (the last choice), so re-runs reuse the same plan.
  const years = admin.getByRole('radiogroup', { name: 'Financial year' });
  const next = years.getByRole('radio').last();
  const nextLabel = (await next.textContent())!.trim();
  await next.click();
  await expect(next).toBeChecked();
  const card = admin.getByRole('list', { name: 'Plan lines by department' }).getByRole('listitem', { name: 'Production' });
  if (!(await card.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await admin.getByRole('button', { name: 'Create plan' }).first().click();
    const d = admin.getByRole('dialog', { name: 'New plan' });
    await expect(d).toContainText(nextLabel);
    await d.getByRole('combobox', { name: /^Department/ }).click();
    await admin.getByRole('option', { name: /^Production/ }).first().click();
    await d.getByRole('group', { name: 'Line 1' }).getByRole('combobox', { name: /^Designation/ }).click();
    await admin.getByRole('option').first().click();
    await d.getByRole('button', { name: 'Send for approval' }).click();
    await expect(d).toHaveCount(0, { timeout: 30_000 });
    await expect(card).toContainText('Waiting for approval', { timeout: 30_000 });
  }
  await expect(card).toBeVisible({ timeout: 30_000 });

  // Another admin approves it in Approvals (its author never can).
  const other = await signedIn(browser, 'admin2@demo-org.test');
  await other.goto('/yx/approvals');
  const waiting = other.getByRole('row', { name: new RegExp(`Headcount plan: Production ${nextLabel}`) });
  if (await waiting.waitFor({ timeout: 15_000 }).then(() => true, () => false)) {
    await waiting.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(waiting).toHaveCount(0, { timeout: 30_000 });
  }
  await admin.reload();
  await admin.getByRole('radiogroup', { name: 'Financial year' }).getByRole('radio', { name: nextLabel }).click();
  await expect(admin.getByRole('list', { name: 'Plan lines by department' }).getByRole('listitem', { name: 'Production' })).toContainText('Approved', { timeout: 30_000 });
});
