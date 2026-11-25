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

async function earnedAvailable(page: Page): Promise<number> {
  // My leave (redesigned): each leave type is a region with its heading and "n days available" (held days are taken off).
  const card = page.getByRole('region').filter({ has: page.getByRole('heading', { name: 'Earned leave', level: 3 }) });
  const text = (await card.getByRole('paragraph').filter({ hasText: /days? available/ }).first().textContent()) ?? '';
  return parseFloat(text.trim());
}

test('Arjun applies for 2 days of earned leave → Divya approves → the balance drops; Arjun checks in inside the geofence', async ({ browser }) => {
  test.setTimeout(240_000);
  const [from, to] = twoWorkdays();

  // 1. Arjun applies.
  const arjunCtx = await browser.newContext({ geolocation: { latitude: 12.97165, longitude: 77.59462, accuracy: 20 }, permissions: ['geolocation'] });
  const arjun = await arjunCtx.newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/time/leave');
  await expect(arjun.getByRole('heading', { name: 'Earned leave' })).toBeVisible();
  const before = await earnedAvailable(arjun);
  await arjun.getByRole('button', { name: 'Apply leave' }).click();
  const sheet = arjun.getByRole('dialog', { name: 'Apply leave' });
  await sheet.getByRole('combobox', { name: /Leave/ }).click();
  await arjun.getByRole('option', { name: /Earned leave/ }).click();
  await sheet.getByRole('textbox', { name: /^From/ }).fill(from);
  await sheet.getByRole('textbox', { name: /^To/ }).fill(to);
  await sheet.getByRole('textbox', { name: /^To/ }).press('Tab');
  // The live summary comes from the server's own rules: 2 days counted, the balance after them.
  const summary = sheet.getByRole('region', { name: 'Leave summary' });
  await expect(summary.getByRole('definition').first()).toHaveText('2');
  await expect(summary).toContainText(`Balance after${before - 2}`);
  await sheet.getByRole('textbox', { name: /Reason/ }).fill('Family visit to Mysuru');
  await sheet.getByRole('button', { name: 'Send request' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(arjun.getByText('Waiting for approval').first()).toBeVisible();
  // While it waits, the days are held: available drops, the balance does not.
  await expect.poll(() => earnedAvailable(arjun)).toBe(before - 2);

  // 2. Divya, his manager, approves in Approvals: the request opens with its reason and the team view; her approval
  // completes it (the step after hers needs no one for this request).
  const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const named = new RegExp(`Arjun Kulkarni: Earned leave, ${short(from)} to ${short(to)}`);
  const divya = await (await browser.newContext()).newPage();
  await signIn(divya, 'panel@demo-org.test', PASSWORD);
  await divya.waitForURL((url) => !url.pathname.includes('sign-in'));
  await divya.goto('/yx/approvals');
  const request = divya.getByRole('row', { name: named });
  await expect(request).toBeVisible({ timeout: 30_000 });
  await request.click();
  const open = divya.getByRole('dialog', { name: named });
  await expect(open.getByRole('region', { name: 'Context' })).toContainText('Reason: Family visit to Mysuru');
  await expect(open.getByRole('region', { name: 'Context' })).toContainText('Team:');
  await open.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(request).toHaveCount(0, { timeout: 30_000 });

  // 3. Arjun's request is approved and the balance (the ledger sum) is 2 lower.
  await arjun.reload();
  await expect(arjun.getByRole('heading', { name: 'Earned leave' })).toBeVisible();
  await expect.poll(() => earnedAvailable(arjun)).toBe(before - 2);
  // The ledger balance itself is now 2 lower too (while it waited only the available days were held).
  await expect(arjun.getByRole('region').filter({ has: arjun.getByRole('heading', { name: 'Earned leave', level: 3 }) }).getByText(/^Balance /)).toHaveText(`Balance ${before - 2}`);
  const long = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const row = arjun.getByRole('list', { name: 'My leave requests' }).getByRole('listitem').filter({ hasText: `Earned leave · ${long(from)} – ${long(to)}` });
  await expect(row).toContainText('Approved');

  // 4. Arjun checks in (or out, if a check-in is already recorded today) from inside the Bengaluru geofence.
  // The clock is the "My attendance today" page now (My month links to it).
  await arjun.goto('/yx/time/attendance?view=today');
  const punch = arjun.getByRole('button', { name: /^Clock (in|out)$/ });
  await expect(punch).toBeVisible();
  await punch.click();
  await expect(arjun.getByRole('status').filter({ hasText: /^(In|Out) recorded\.$/ })).toBeVisible();
  // Today's punches name the place and that the punch was inside its geofence.
  await expect(arjun.getByText(/At Bengaluru head office \(\d+ m from centre\)/).first()).toBeVisible();
});
