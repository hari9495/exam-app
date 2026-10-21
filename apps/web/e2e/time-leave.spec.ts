import { expect, test, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Step 4 · Time and leave batch 1, main flow on the seeded Kaveri Foods demo: Arjun applies for 2 days of earned
// leave; his manager Divya approves it in Approvals (P03); his earned-leave balance drops by 2; then Arjun checks in
// from inside the Bengaluru head office geofence.
//
// Needs the API and web against the seeded database (locally: API on 3501, web on 3500 with
// NEXT_PUBLIC_API_BASE=http://localhost:3501/api/v1, WEB_BASE_URL=http://localhost:3500).

const PASSWORD = 'Passw0rd!2026';
// Bengaluru holidays in the seed (seed-time.ts) that fall on weekdays.
const HOLIDAYS = ['2026-10-20', '2026-11-09', '2026-12-24', '2026-12-25', '2027-01-01', '2027-01-15', '2027-01-26', '2027-03-26', '2027-04-07'];

/** Two working weekdays in a row (Mon–Fri, no holiday), a few weeks out; a later run picks a later pair. */
function twoWorkdays(): [string, string] {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const start = new Date(Date.now() + 330 * 60_000);
  start.setUTCDate(start.getUTCDate() + 21 + (Math.floor(Date.now() / 60_000) % 60));
  for (let d = new Date(start); ; d.setUTCDate(d.getUTCDate() + 1)) {
    const next = new Date(d.getTime() + 86_400_000);
    const ok = (x: Date) => x.getUTCDay() >= 1 && x.getUTCDay() <= 5 && !HOLIDAYS.includes(iso(x));
    if (ok(d) && ok(next)) return [iso(d), iso(next)];
  }
}

/** "21 days available" on the designed Earned leave card (TIM-17). */
async function earnedAvailable(page: Page): Promise<number> {
  const text = (await page.getByRole('region', { name: 'Earned leave' }).getByText(/days? available/).textContent()) ?? '';
  return Number(text.trim().split(' ')[0]);
}

/** 2026-11-12 → "12 Nov 2026", as the date fields take it. */
const typed = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

test('Arjun applies for 2 days of earned leave → Divya approves → the balance drops; Arjun checks in inside the geofence', async ({ browser }) => {
  test.setTimeout(240_000);
  const [from, to] = twoWorkdays();

  // 1. Arjun applies on the designed My leave screen (TIM-17 / TIM-18).
  const arjunCtx = await browser.newContext({ geolocation: { latitude: 12.97165, longitude: 77.59462, accuracy: 20 }, permissions: ['geolocation'] });
  const arjun = await arjunCtx.newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/time/leave');
  await expect(arjun.getByRole('heading', { name: 'Earned leave' })).toBeVisible();
  const before = await earnedAvailable(arjun);
  await arjun.getByRole('button', { name: 'Apply leave' }).click();
  const sheet = arjun.getByRole('dialog', { name: 'Apply leave' });
  await sheet.getByRole('combobox', { name: /Leave type/ }).click();
  await arjun.getByRole('option', { name: /Earned leave/ }).click();
  await sheet.getByRole('textbox', { name: 'From' }).fill(typed(from));
  await sheet.getByRole('textbox', { name: 'From' }).press('Tab');
  await sheet.getByRole('textbox', { name: 'To' }).fill(typed(to));
  await sheet.getByRole('textbox', { name: 'To' }).press('Tab');
  // The live summary comes from the server's own rules.
  const summary = sheet.getByRole('region', { name: 'Leave summary' });
  await expect(summary.getByText('Days counted')).toBeVisible();
  await expect(summary).toContainText('2');
  await sheet.getByRole('textbox', { name: /Reason/ }).fill('Family visit to Mysuru');
  await sheet.getByRole('button', { name: 'Send request' }).click();
  await expect(sheet).toHaveCount(0);
  // The toast names the approver and the dates (founder rule, 20 Oct 2026).
  await expect(arjun.getByText(/^Earned leave request sent to .+ for /).first()).toBeVisible();
  await expect(arjun.getByRole('region', { name: 'My requests' }).getByRole('listitem').filter({ hasText: 'Earned leave' }).filter({ hasText: 'Waiting for your manager' }).first()).toBeVisible();
  // While it waits, the days are held: available drops.
  await expect.poll(() => earnedAvailable(arjun)).toBe(before - 2);
  // 2. Divya, his manager, approves in Approvals.
  const divya = await (await browser.newContext()).newPage();
  await signIn(divya, 'panel@demo-org.test', PASSWORD);
  await divya.waitForURL((url) => !url.pathname.includes('sign-in'));
  await divya.goto('/yx/approvals');
  const card = divya.locator('section').filter({ has: divya.getByRole('heading', { name: /Arjun Kulkarni: Earned leave/ }) }).last();
  await expect(card).toBeVisible();
  await expect(card.getByText('Family visit to Mysuru')).toBeVisible();
  await expect(card.getByText('Team', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(card).toHaveCount(0);

  // 3. Arjun's request is approved and the balance (the ledger sum) is 2 lower.
  await arjun.reload();
  await expect(arjun.getByRole('heading', { name: 'Earned leave' })).toBeVisible();
  await expect.poll(() => earnedAvailable(arjun)).toBe(before - 2);
  const mine = arjun.getByRole('region', { name: 'My requests' }).getByRole('listitem').filter({ hasText: 'Earned leave' }).first();
  await expect(mine.getByText('Approved').first()).toBeVisible();

  // 4. Arjun clocks in (or out, if he already clocked in today) on Home, from inside the Bengaluru geofence.
  await arjun.goto('/yx/home');
  const punch = arjun.getByRole('button', { name: /^Clock (in|out)$/ }).and(arjun.locator(':enabled')).first();
  await expect(punch).toBeVisible();
  await punch.click();
  await expect(arjun.getByRole('status').filter({ hasText: /(In|Out) recorded\./ })).toHaveCount(1);
  await expect(arjun.getByText('Not recorded')).toHaveCount(0);
});
