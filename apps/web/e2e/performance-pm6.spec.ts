import { expect, test, type Browser, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM6 on the seeded Kaveri Foods demo: a manager-only plant cycle; Kavya rates Murugan; the admin
// opens a calibration session and drags Murugan to another band, which asks for a reason; then signs off.
// Each run makes its own cycle, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('calibration: drag a person to another band with a reason, then sign off', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const name = `Plant calibration ${tag}`;
  const pick = async (page: Page, label: string, iso: string) => {
    const box = page.getByRole('dialog').getByRole('textbox', { name: label });
    await box.fill(shown(iso));
    await box.press('Enter');
  };

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/settings/performance');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('tab', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(admin.getByRole('tab', { name: 'Review templates' })).toBeVisible({ timeout: 30_000 });
  await admin.goto('/yx/performance/cycles');
  await admin.getByRole('button', { name: 'New cycle' }).click();
  const sheet = admin.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /^Name/ }).fill(name);
  await sheet.getByRole('combobox', { name: 'Template' }).click();
  await admin.getByRole('option', { name: /^Annual review/ }).first().click();
  await pick(admin, 'Period starts on', '2025-04-01');
  await pick(admin, 'Period ends on', '2026-03-31');
  await sheet.getByRole('combobox', { name: 'Departments in the cycle' }).click();
  await admin.getByRole('option', { name: /Production/ }).first().click();
  await admin.keyboard.press('Escape');
  await sheet.getByRole('checkbox', { name: /Self review/ }).click();
  await pick(admin, 'Manager review due', day(14));
  await sheet.getByRole('button', { name: 'Save' }).click();
  await admin.waitForURL(/\/yx\/performance\/cycles\/[0-9a-f-]+$/, { timeout: 30_000 });
  const cycleUrl = admin.url();
  await admin.getByRole('button', { name: 'Run the check' }).click();
  await expect(admin.getByText('Ready to start')).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Start the cycle' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Start' }).click();
  await expect(admin.getByText('Where reviews are')).toBeVisible({ timeout: 30_000 });

  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await kv.goto('/yx/performance/reviews');
  await kv.getByRole('radio', { name: 'My team' }).click();
  await kv.getByRole('row', { name: new RegExp(`Murugan.*${name}`) }).getByRole('button', { name: 'Open' }).click();
  await kv.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  for (const box of await kv.getByRole('textbox').all()) if (await box.isEditable()) await box.fill('Steady and safe.');
  await kv.getByRole('button', { name: 'Submit' }).click();
  await kv.getByRole('dialog').getByRole('button', { name: 'Submit' }).click();
  await expect(kv.getByText(/Waiting for release/).first()).toBeVisible({ timeout: 30_000 });

  await admin.goto(cycleUrl);
  await admin.getByRole('button', { name: 'Open a session' }).click();
  const open = admin.getByRole('dialog');
  await open.getByRole('textbox', { name: /^Name/ }).fill(`Plant ${tag}`);
  await open.getByRole('combobox', { name: 'Facilitator' }).click();
  await admin.getByRole('option', { name: 'Ramesh Iyer' }).click();
  await open.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(open).toHaveCount(0, { timeout: 30_000 });
  // Ramesh (the admin) facilitates his own session.
  await admin.getByRole('button', { name: 'Open', exact: true }).last().click();
  await admin.waitForURL(/\/yx\/performance\/calibrations\/[0-9a-f-]+$/, { timeout: 30_000 });
  const card = admin.locator('[data-review]').filter({ hasText: 'Murugan' }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const from = await card.locator('xpath=ancestor::*[@data-band][1]').getAttribute('data-band');
  const target = (await admin.locator('[data-band]').evaluateAll((els, f) => els.map((e) => e.getAttribute('data-band')).find((b) => b !== f), from)) as string;
  await card.dragTo(admin.locator(`[data-band="${target}"]`));
  const dlg = admin.getByRole('dialog');
  await expect(dlg.getByRole('button', { name: 'Move' })).toBeDisabled();
  await dlg.getByRole('textbox', { name: /Reason/ }).fill('Compared with the other plant leads');
  await dlg.getByRole('button', { name: 'Move' }).click();
  await expect(admin.getByRole('cell', { name: 'Compared with the other plant leads' })).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Sign off' }).click();
  await admin.getByRole('dialog').getByRole('button', { name: 'Sign off' }).click();
  await expect(admin.getByText(/Signed off/).first()).toBeVisible({ timeout: 30_000 });
});
