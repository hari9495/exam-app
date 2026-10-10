import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Lifecycle batch 6d on the seeded Kaveri Foods demo: Lakshmi (HR) makes a fresh employee (add a joiner who starts
// today, mark joined), starts an "End of contract" exit with today as the last working day, and sees the clearance and
// the payroll hand-off (final dues two working days after the last day); Divya gets an instant employment certificate
// from Me › My documents and finds it in My letters.
// T+0 (the employment ends once the last day is over in India), the exit steps and the alumni login need the clock
// and the emailed code: the API e2e (lifecycle-6d.e2e-spec.ts) covers them.

const PASSWORD = 'Passw0rd!2026';

async function signedIn(browser: import('@playwright/test').Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}

async function pick(page: import('@playwright/test').Page, scope: import('@playwright/test').Locator, label: string, option: RegExp) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}

test('a fresh employee → End of contract today → clearance and the payroll hand-off; an instant certificate', async ({ browser }) => {
  test.setTimeout(300_000);
  const first = `Ezra${Date.now().toString(36)}`;
  const today = new Date(Date.now() + 330 * 60_000).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const hr = await signedIn(browser, 'hr@demo-org.test');

  // A fresh employee for this run.
  await hr.goto('/yx/people/onboarding');
  await hr.getByRole('button', { name: 'Add joiner' }).click();
  const sheet = hr.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /First name/ }).fill(first);
  await sheet.getByRole('textbox', { name: /Last name/ }).fill('Paul');
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
  await hr.getByRole('button', { name: 'Mark joined' }).click();
  const join = hr.getByRole('dialog');
  await join.getByRole('checkbox', { name: /original ID/ }).click();
  await join.getByRole('button', { name: 'Mark joined' }).click();
  await expect(join).toHaveCount(0, { timeout: 30_000 });

  // HR starts an "End of contract" exit with today as the last working day.
  await hr.goto('/yx/people/exits');
  await hr.getByRole('button', { name: 'Start exit' }).click();
  const start = hr.getByRole('dialog');
  await pick(hr, start, 'Person', new RegExp(first));
  await pick(hr, start, 'Kind of exit', /End of contract/);
  await start.getByRole('textbox', { name: 'Last working day' }).fill(today);
  await start.getByRole('textbox', { name: 'Last working day' }).press('Tab');
  await start.getByRole('textbox', { name: /Reason/ }).fill('Fixed-term contract ends today');
  await start.getByRole('button', { name: 'Start exit' }).click();
  await hr.waitForURL(/\/yx\/people\/exits\/[^/]+$/);
  await expect(hr.getByText('Serving notice')).toBeVisible();
  await expect(hr.getByRole('heading', { name: 'Payroll hand-off' })).toBeVisible();
  await expect(hr.getByText('Final dues by')).toBeVisible();
  // Clearance is open: the handover item waits for the manager.
  const handover = hr.getByRole('row', { name: /Work and files handed over/ });
  await expect(handover.getByText('To do')).toBeVisible();

  // Divya: an instant employment certificate.
  const divya = await signedIn(browser, 'panel@demo-org.test');
  await divya.goto('/yx/me/documents');
  await divya.getByRole('button', { name: 'Get an employment certificate' }).click();
  await expect(divya.getByText('Your certificate is ready')).toBeVisible({ timeout: 30_000 });
  await divya.goto('/yx/me/letters');
  await expect(divya.getByText(/Employment certificate/).first()).toBeVisible();
});
