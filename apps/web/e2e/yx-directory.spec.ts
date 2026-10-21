import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// The designed screen is drawn at 1440 px; narrower, the optional columns (ID) fold away.
test.use({ viewport: { width: 1440, height: 900 } });

// People › Directory on the designed screen (PPL-01, design audit step 2), on the seeded demo: HR sees the cards, ID and
// status, saves a view (toast), exports and starts a letter for the people chosen; a colleague sees Public fields only,
// with the quick chips.
test('HR: cards, ID and status, a saved view, export and Issue letter', async ({ page }) => {
  await signIn(page, 'hr@demo-org.test', 'Passw0rd!2026');
  await page.goto('/yx/people/directory');
  const tabs = page.getByRole('tablist', { name: 'Workforce' });
  await expect(tabs.getByRole('tab', { name: /Employees/ })).toBeVisible({ timeout: 30_000 });
  // HR holds the contract labour and placement keys, and the demo has both.
  await expect(tabs.getByRole('tab', { name: /Contract workers/ })).toBeVisible();
  await expect(tabs.getByRole('tab', { name: /Placements/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^Status/ })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: /^ID/ })).toBeVisible();

  // A saved view: search, save as, the toast, and it is listed.
  await page.getByRole('textbox', { name: 'Search name, ID, email or phone' }).fill('Arjun');
  await page.getByRole('button', { name: /^View:/ }).click();
  await page.getByRole('menuitem', { name: /Save as new view/ }).click();
  const name = `Arjun ${Date.now().toString(36)}`;
  await page.getByRole('textbox', { name: /View name/ }).fill(name);
  await expect(page.getByRole('checkbox', { name: 'Share with the team' })).toBeVisible();
  await page.getByRole('button', { name: 'Save view' }).click();
  await expect(page.getByText(`View "${name}" saved`).first()).toBeVisible();
  await page.getByRole('button', { name: /^View:/ }).click();
  await expect(page.getByRole('menuitem', { name })).toBeVisible();
  await page.keyboard.press('Escape');

  // Export what is shown, as a file.
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export' }).click().then(() => page.getByRole('menuitem', { name: /CSV/ }).click())]);
  expect(file.suggestedFilename()).toBe('directory.csv');

  // Issue letter for the people chosen: the letters wizard opens with them.
  await page.getByRole('checkbox', { name: /^Select Arjun/ }).first().click();
  await page.getByRole('button', { name: 'Issue letter' }).click();
  await page.waitForURL(/\/yx\/people\/letters\?people=/);
  await expect(page.getByRole('dialog', { name: 'Issue a letter to many' })).toBeVisible({ timeout: 30_000 });
});

test('a colleague: Public fields only, and the quick chips', async ({ page }) => {
  await signIn(page, 'arjun@demo-org.test', 'Passw0rd!2026');
  await page.goto('/yx/people/directory');
  await expect(page.getByRole('radiogroup', { name: 'Show' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('tablist', { name: 'Workforce' })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /^Status/ })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: /^ID/ })).toHaveCount(0);
  await page.getByRole('radio', { name: 'My department' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  // A colleague keeps views for themselves: only HR can share one with everyone.
  await page.getByRole('button', { name: /^View:/ }).click();
  await page.getByRole('menuitem', { name: /Save as new view/ }).click();
  await expect(page.getByRole('textbox', { name: /View name/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Share with the team' })).toHaveCount(0);
});
