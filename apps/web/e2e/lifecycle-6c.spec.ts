import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Lifecycle batch 6c, main flow on the seeded Kaveri Foods demo: Lakshmi (HR) adds a laptop and issues it to Divya;
// Divya confirms she has it and resigns (Me › Resign shows the notice and the last day); Lakshmi accepts it in
// Approvals (Divya's manager has no login, so HR decides alone); the exit shows "Serving notice" with the laptop on
// the clearance list; taking the laptop back clears that item; Divya then asks to withdraw and Lakshmi agrees, which
// leaves the demo as it was (the test can run again).
//
// Needs the API and web against the seeded database (locally: API on 3901, web on 3900).

const PASSWORD = 'Passw0rd!2026';

async function signedIn(browser: import('@playwright/test').Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}

async function approve(page: import('@playwright/test').Page, heading: RegExp) {
  await page.goto('/yx/approvals');
  const card = page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) }).last();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);
}

test('assets → resignation accepted by HR → clearance from the asset return → withdrawal', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = `PW-${Date.now().toString(36).toUpperCase()}`;
  const name = `Laptop ${tag}`;
  const hr = await signedIn(browser, 'hr@demo-org.test');

  // An asset, issued to Divya.
  await hr.goto('/yx/people/assets');
  await hr.getByRole('button', { name: 'Add asset' }).click();
  const drawer = hr.getByRole('dialog');
  await drawer.getByRole('textbox', { name: /Kind/ }).fill('Laptop');
  await drawer.getByRole('textbox', { name: /^Name/ }).fill(name);
  await drawer.getByRole('textbox', { name: /Asset tag/ }).fill(tag);
  await drawer.getByRole('textbox', { name: /Cost/ }).fill('55000');
  await drawer.getByRole('button', { name: 'Add asset' }).click();
  await expect(drawer).toHaveCount(0);
  await hr.getByRole('row', { name: new RegExp(tag) }).getByRole('button', { name: 'Issue' }).click();
  const issue = hr.getByRole('dialog');
  await issue.getByRole('combobox', { name: 'To' }).click();
  await hr.getByRole('option', { name: /Divya Raghunathan/ }).first().click();
  await issue.getByRole('button', { name: 'Issue' }).click();
  await expect(hr.getByRole('row', { name: new RegExp(tag) }).getByText('With someone')).toBeVisible();

  // Divya confirms she has it, then resigns.
  const divya = await signedIn(browser, 'panel@demo-org.test');
  await divya.goto('/yx/me/assets');
  await divya.getByRole('row', { name: new RegExp(tag) }).getByRole('button', { name: 'I have it' }).click();
  await expect(divya.getByRole('row', { name: new RegExp(tag) }).getByText('Confirmed')).toBeVisible();
  await divya.goto('/yx/me/resignation');
  await expect(divya.getByText('Last working day if you resign today')).toBeVisible();
  await divya.getByRole('combobox', { name: 'Main reason' }).click();
  await divya.getByRole('option', { name: 'Higher studies' }).click();
  await divya.getByRole('textbox', { name: /In your own words/ }).fill('Going back to study for a master’s degree.');
  await divya.getByRole('button', { name: 'Resign' }).click();
  await divya.getByRole('dialog').getByRole('button', { name: 'Send resignation' }).click();
  await expect(divya.getByText('Waiting for acceptance')).toBeVisible();

  // HR accepts; the exit is on notice and the laptop is on the clearance list.
  await approve(hr, /Resignation of Divya/);
  await hr.goto('/yx/people/exits');
  const row = hr.getByRole('row', { name: /Divya/ }).first();
  await expect(row.getByText('Serving notice')).toBeVisible();
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(hr.getByRole('row', { name: new RegExp(`Return ${name}`) }).getByText('To do')).toBeVisible();
  const exitUrl = hr.url();

  // Taking the laptop back clears its item.
  await hr.goto('/yx/people/assets');
  await hr.getByRole('row', { name: new RegExp(tag) }).getByRole('button', { name: 'Take back' }).click();
  const back = hr.getByRole('dialog');
  await back.getByRole('textbox', { name: /Condition/ }).fill('Good, with charger');
  await back.getByRole('button', { name: 'Take back' }).click();
  await expect(back).toHaveCount(0);
  await hr.goto(exitUrl);
  await expect(hr.getByRole('row', { name: new RegExp(`Return ${name}`) }).getByText('Cleared')).toBeVisible();

  // Divya changes her mind: HR agrees, the demo is as it was.
  await divya.goto('/yx/me/resignation');
  await divya.getByRole('button', { name: 'Withdraw' }).click();
  await divya.getByRole('dialog').getByRole('textbox', { name: /Why/ }).fill('Deferred my admission by a year');
  await divya.getByRole('dialog').getByRole('button', { name: 'Ask to withdraw' }).click();
  await expect(divya.getByText('Withdrawal asked for')).toBeVisible();
  await approve(hr, /asks to withdraw their resignation/);
  await expect(async () => {
    await divya.goto('/yx/me/resignation');
    await expect(divya.getByText('Give your resignation')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});
