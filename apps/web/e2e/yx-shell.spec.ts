import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// The designed app frame live on the seeded demo (design audit step 1): Home on sign-in, the rail by product area with
// keyboard moves, Ctrl K search from the server, the bell, Help, breadcrumbs and the account menu.
test('HR: Home, rail and menus by keyboard, search, bell, Help, breadcrumbs, account menu', async ({ page }) => {
  await signIn(page, 'hr@demo-org.test', 'Passw0rd!2026');
  await page.waitForURL(/\/yx\/home$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { level: 1, name: /^Good (morning|afternoon|evening), Lakshmi$/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Home' }).getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');

  // The rail: one tab stop, arrow keys move between areas, Enter opens one.
  const rail = page.getByRole('navigation', { name: 'Areas' });
  await expect(rail.getByRole('link', { name: 'People' })).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Assess' })).toHaveCount(0);
  // Home's widgets may still be loading and take focus once; the arrow key must move focus from Home to People.
  await expect(async () => {
    await rail.getByRole('link', { name: 'Home' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(rail.getByRole('link', { name: 'People' })).toBeFocused({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/yx\/people\/directory/);
  await expect(page.getByRole('navigation', { name: 'People' }).getByRole('link', { name: 'Directory' })).toHaveAttribute('aria-current', 'page');

  // Below the top level: Area › Page.
  await page.getByRole('navigation', { name: 'People' }).getByRole('link', { name: 'Org chart' }).click();
  await page.waitForURL(/\/yx\/people\/org-chart/);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).filter({ visible: true })).toContainText('Org chart');

  // Ctrl K: people from the server; Enter opens the first one.
  await page.keyboard.press('Control+k');
  const box = page.getByRole('dialog', { name: 'Search and actions' }).getByRole('combobox');
  await expect(box).toBeFocused();
  await box.fill('Arjun');
  await expect(page.getByRole('option', { name: /Arjun/ }).first()).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/yx\/people\/(profile\?person=|directory\?q=)/);

  // Pages are in search as actions too.
  await page.keyboard.press('Control+k');
  await page.getByRole('dialog', { name: 'Search and actions' }).getByRole('combobox').fill('>Probation');
  await page.getByRole('option', { name: /Probation/ }).first().click();
  await page.waitForURL(/\/yx\/people\/probation/);

  // The bell and Help in the top bar.
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' }).or(page.getByLabel('Notifications').last())).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Help', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');

  // The account menu by keyboard: My security.
  await page.getByRole('button', { name: /^Account menu for/ }).focus();
  await page.keyboard.press('Enter');
  const security = page.getByRole('menuitem', { name: 'My security' });
  await expect(security).toBeVisible();
  await security.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/yx\/me\/security$/);
});

test('Payroll: the Pay area and the company / period button', async ({ page }) => {
  await signIn(page, 'payroll@demo-org.test', 'Passw0rd!2026');
  await page.waitForURL(/\/yx\/(home|me\/first-30-days)$/, { timeout: 30_000 });
  // Salary pages ask "Confirm it's you" first (batch B, answer 2360); the walk-through confirms, as a passkey would.
  await stepUp('payroll@demo-org.test');
  await page.getByRole('navigation', { name: 'Areas' }).getByRole('link', { name: 'Pay' }).click();
  const pay = page.getByRole('navigation', { name: 'Pay' });
  // The runs page is the Payroll home in the Pay menu (renamed with the payroll home).
  await expect(pay.getByRole('link', { name: 'Payroll home' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Showing .*Change/ })).toBeVisible();
});
