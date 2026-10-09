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
  const card = page.locator('section[aria-label="Balances"] > *').filter({ has: page.getByRole('heading', { name: 'Earned leave' }) });
  const text = (await card.locator('.yx-tim-big').textContent()) ?? '';
  return Number(text.trim().split(' ')[0]);
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
  await arjun.getByRole('button', { name: 'Apply for leave' }).click();
  const sheet = arjun.getByRole('dialog');
  await sheet.getByRole('combobox', { name: /Leave/ }).click();
  await arjun.getByRole('option', { name: /Earned leave/ }).click();
  await sheet.getByLabel(/First day/).fill(from);
  await sheet.getByLabel(/Last day/).fill(to);
  // The live summary comes from the server's own rules.
  await expect(sheet.getByText('Counts as')).toBeVisible();
  await expect(sheet.locator('.yx-tim-effect')).toContainText('2 days');
  await expect(sheet.locator('.yx-tim-effect')).toContainText(String(before - 2));
  await sheet.getByRole('textbox', { name: /Reason/ }).fill('Family visit to Mysuru');
  await sheet.getByRole('button', { name: 'Send for approval' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(arjun.getByText('Waiting for approval').first()).toBeVisible();
  // While it waits, the days are held: available drops, the balance does not.
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
  await expect(arjun.getByText(/Balance \d+(\.\d+)? ·/).first()).toBeVisible();
  const row = arjun.getByRole('row').filter({ hasText: 'Earned leave' }).first();
  await expect(row.getByText('Approved')).toBeVisible();

  // 4. Arjun checks in (or out, if a check-in is already recorded today) from inside the Bengaluru geofence.
  await arjun.goto('/yx/time/attendance');
  const punch = arjun.getByRole('button', { name: /^Check (in|out)$/ });
  await expect(punch).toBeVisible();
  await punch.click();
  await expect(arjun.getByText(/Checked (in|out)\. Inside Bengaluru head office/)).toBeVisible();
  await expect(arjun.getByRole('list', { name: 'Punches today' }).getByText(/Inside · Bengaluru head office/).first()).toBeVisible();
});
