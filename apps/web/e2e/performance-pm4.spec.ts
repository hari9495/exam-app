import { expect, test, type Browser } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Performance batch PM4 on the seeded Kaveri Foods demo: the admin starts a cycle for the plant team on the annual
// starter template after the pre-flight check; Murugan sends his self review and sees no score; Kavya, his manager,
// saves a draft, reads his self review and submits; the score is worked out from her ratings; HR releases and Murugan
// acknowledges.
// Each run makes its own cycle for a past period of its own, so the test can run again.

const PASSWORD = 'Passw0rd!2026';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shown = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

async function signedIn(browser: Browser, email: string, password: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, password);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  return page;
}

test('cycle → self review → manager review with a worked-out score', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const day = (n: number) => new Date(Date.now() + 330 * 60_000 + n * 86_400_000).toISOString().slice(0, 10);
  const name = `Plant review ${tag}`;

  const admin = await signedIn(browser, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.goto('/yx/settings/talent/performance');
  const starters = admin.getByRole('button', { name: 'Use the starters' });
  await expect(starters.or(admin.getByRole('table', { name: 'Review templates' })).first()).toBeVisible({ timeout: 30_000 });
  if (await starters.isVisible()) await starters.click();
  await expect(admin.getByRole('table', { name: 'Review templates' })).toBeVisible({ timeout: 30_000 });
  // PRF-04: a new cycle is a set-up wizard (5df0b91b3); the cycles list lives on the Performance home.
  await admin.goto('/yx/performance/cycles/new');
  const setup = admin.locator('main').last();
  const day2 = async (label: string, iso: string) => {
    await setup.getByRole('textbox', { name: label }).fill(shown(iso));
    await setup.getByRole('textbox', { name: label }).press('Enter');
  };
  await setup.getByRole('textbox', { name: /Cycle name/ }).fill(name);
  await setup.getByRole('combobox', { name: 'Type' }).click();
  await admin.getByRole('option', { name: 'Annual', exact: true }).click();
  await day2('Period starts', '2025-04-01');
  await day2('Period ends', '2026-03-31');
  await setup.getByRole('button', { name: 'Continue' }).click();
  await setup.getByRole('combobox', { name: 'Departments in the cycle' }).click();
  await admin.getByRole('option', { name: /Production/ }).first().click();
  await admin.keyboard.press('Escape');
  await setup.getByRole('button', { name: 'Continue' }).click();
  // Continuing without a template is refused in place.
  await setup.getByRole('button', { name: 'Continue' }).click();
  await expect(setup.getByText('Choose an active template of this type.').first()).toBeVisible();
  await setup.getByRole('combobox', { name: 'Template' }).click();
  await admin.getByRole('option', { name: /^Annual review/ }).first().click();
  await setup.getByRole('button', { name: 'Continue' }).click();
  await day2('Self review due', day(7));
  await day2('Manager review due', day(14));
  await setup.getByRole('button', { name: 'Continue' }).click();
  await expect(setup.getByRole('region', { name: 'Review and launch' })).toContainText(name);
  await setup.getByRole('button', { name: 'Launch cycle' }).click();
  await admin.waitForURL(/\/yx\/performance\/cycles\/[0-9a-f-]+$/, { timeout: 30_000 });
  const cycleUrl = admin.url();
  await expect(admin.getByRole('heading', { name, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(admin.locator('main').last()).toContainText(/Running.*people · launched/);

  // Murugan's self review, from his home (the reviews list was retired, 9a2c75b7f).
  const mu = await signedIn(browser, 'murugan@demo-org.test', PASSWORD);
  const openMine = async () => {
    await mu.goto('/yx/performance');
    await mu.getByRole('region', { name: `My review · ${name}` }).getByRole('link', { name: 'Open my review' }).click();
  };
  await openMine();
  const mine = mu.locator('main').last();
  await mine.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  await mine.getByRole('radiogroup', { name: 'Rating for Competencies' }).getByRole('radio', { name: /^4 / }).click();
  for (const box of await mine.getByRole('textbox').all()) if (await box.isEditable()) await box.fill('Kept the line running through the monsoon.');
  await mine.getByRole('button', { name: 'Complete self review' }).click();
  await mu.getByRole('dialog', { name: 'Complete your self review?' }).getByRole('button', { name: 'Complete self review' }).click();
  await expect(mine.getByRole('list', { name: 'Review stages' })).toContainText(/Manager review\s*Now · Kavya/, { timeout: 30_000 });

  // Kavya: the self review stays hidden until she saves a draft of her own; then she completes hers.
  const kv = await signedIn(browser, 'kavya@demo-org.test', PASSWORD);
  await kv.goto('/yx/performance');
  await kv.getByRole('link', { name: `Review: Manager review · ${name}` }).click();
  const hers = kv.locator('main').last();
  await expect(hers.getByText(/Save a draft of your own first/)).toBeVisible({ timeout: 30_000 });
  await expect(hers.getByText('Kept the line running through the monsoon.')).toHaveCount(0);
  await hers.getByRole('radiogroup', { name: 'Rating for Goals' }).getByRole('radio', { name: /^4 / }).click();
  await hers.getByRole('button', { name: 'Save draft' }).click();
  await expect(hers.getByText('Kept the line running through the monsoon.').first()).toBeVisible({ timeout: 30_000 });
  await hers.getByRole('radiogroup', { name: 'Rating for Competencies' }).getByRole('radio', { name: /^4 / }).click();
  for (const box of await hers.getByRole('textbox').all()) if (await box.isEditable()) await box.fill('Steady and safe.');
  await hers.getByRole('button', { name: 'Complete manager review' }).click();
  await kv.getByRole('dialog').getByRole('button', { name: 'Complete manager review' }).click();
  // The worked-out score: 4 on both sections (60% / 40%).
  await expect(hers.getByRole('region', { name: 'Score' })).toContainText('4.00', { timeout: 30_000 });

  // HR releases; Murugan reads his rating and acknowledges it (PM-4.06).
  await admin.goto(cycleUrl);
  await admin.getByRole('button', { name: 'Release ratings' }).click();
  const release = admin.getByRole('dialog');
  await release.getByRole('button').last().click();
  await expect(release).toHaveCount(0, { timeout: 30_000 });
  await mu.goto('/yx/performance');
  await mu.getByRole('link', { name: `Open: Read and acknowledge your review · ${name}` }).click();
  const rated = mine.getByRole('region', { name: 'Your released rating' });
  await expect(rated).toContainText(/4\.00\s*Exceeds/, { timeout: 30_000 });
  await expect(mine.getByRole('region', { name: 'Summary from Kavya Reddy' })).toContainText('Steady and safe.');
  await mine.getByRole('button', { name: 'Acknowledge review' }).click();
  await expect(mine.getByRole('status').filter({ hasText: /^Acknowledged on / })).toBeVisible({ timeout: 30_000 });
});
