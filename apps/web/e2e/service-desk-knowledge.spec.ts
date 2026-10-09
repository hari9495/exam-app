import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn, staffSignIn } from './fixtures/sign-in';
import { cleanUp, createStaff } from './fixtures/console-db';
import { linkConsoleAgent, unlinkConsoleAgent } from './fixtures/desk-db';

// M14 Service Desk, phase 3b-1 batch 4 on the seeded Kaveri Foods demo and the YukthiX platform tenant:
//   1. a customer finds a public help article on /yx/help/demo-org/help (search, the old address redirects, "This
//      solved it");
//   2. Kaveri Foods' System Admin raises "Contact YukthiX"; a YukthiX Support agent sees it in the console queue with
//      the tenant panel and asks the company for access from the ticket.
//
// Needs its own API and web against the seeded database (locally: API on 3411 with REDIS_URL=…/11, web built with
// NEXT_PUBLIC_API_BASE=http://localhost:3411/api/v1 and started on 3410, WEB_BASE_URL=http://localhost:3410).
// Security keys are Chromium virtual authenticators.

const run = randomUUID().slice(0, 8);
const STAFF = { email: `e2e-desk-staff-${run}@platform.test`, password: `Staff-Passw0rd-${run}` };
let staffId: string | null = null;

async function virtualKey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}

test.beforeAll(async () => {
  staffId = await createStaff(STAFF.email, STAFF.password);
  await linkConsoleAgent(staffId, `Desk E2E ${run}`);
});
test.afterAll(async () => {
  if (staffId) await unlinkConsoleAgent(staffId);
  await cleanUp(staffId, `no-company-${run}`);
});

test('a customer finds a public help article: search, an old address, "This solved it"', async ({ page }) => {
  await page.goto('/yx/help/demo-org/help');
  await expect(page.getByRole('heading', { name: 'Kaveri Foods Help' })).toBeVisible();
  await expect(page).toHaveTitle(/Kaveri Foods Help \| Kaveri Foods/);
  await page.getByRole('textbox', { name: /Search for an answer/ }).fill('track order');
  await page.getByRole('list', { name: 'Search results' }).getByRole('link', { name: 'How to track your order' }).click();
  await expect(page).toHaveURL(/\/yx\/help\/demo-org\/help\/track-your-order$/);
  await expect(page.getByRole('heading', { name: 'How to track your order' })).toBeVisible();
  // The shared block shows its current text inside the article.
  await expect(page.getByText(/Customer Care answers Monday to Saturday/)).toBeVisible();
  await page.getByRole('button', { name: 'This solved it' }).click();
  await expect(page.getByText('Glad it helped.')).toBeVisible();
  // An earlier address of the article sends a permanent redirect to where it lives now.
  const res = await page.request.get('/yx/help/demo-org/help/order-tracking', { maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()['location']).toContain('/yx/help/demo-org/help/track-your-order');
  // Articles for agents or employees never show here.
  await page.goto('/yx/help/demo-org/help');
  await expect(page.getByText('Printer jam on the 2nd floor')).toHaveCount(0);
  const map = await page.request.get('/yx/help/demo-org/help/sitemap.xml');
  expect(await map.text()).toContain('track-your-order');
});

test('Kaveri Foods asks YukthiX for help; a YukthiX Support agent sees it in the console and asks for access', async ({ browser }) => {
  test.setTimeout(240_000);
  const subject = `Leave balances look wrong ${run}`;

  // 1. The company's System Admin raises it from inside the company.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));
  await admin.goto('/yx/support');
  await admin.getByRole('textbox', { name: /Subject/ }).fill(subject);
  await admin.getByRole('textbox', { name: /Details/ }).fill('Three employees in Mysuru see 0 days of casual leave since this morning.');
  await admin.getByRole('radio', { name: /Badly hurt/ }).click();
  await admin.getByRole('button', { name: /Send to YukthiX/ }).click();
  await expect(admin.getByText(/YXS-\d+/).first()).toBeVisible();
  await expect(admin.getByText(subject).first()).toBeVisible();

  // 2. A YukthiX Support agent signs in with a security key and finds it in the console queue.
  const staff = await (await browser.newContext()).newPage();
  await virtualKey(staff);
  await staffSignIn(staff, STAFF.email, STAFF.password);
  await expect(staff).toHaveURL(/\/yx\/setup-mfa/);
  await staff.getByRole('button', { name: /Passkey/ }).click();
  await staff.waitForURL(/\/staff\//);
  await staff.goto('/staff/support-desk');
  await staff.getByText(subject).first().click();
  await staff.waitForURL(/\/staff\/support-desk\/[0-9a-f-]{36}$/);
  await expect(staff.getByText(subject).first()).toBeVisible();
  // The tenant panel: account facts only.
  await expect(staff.getByText('Kaveri Foods').first()).toBeVisible();
  await expect(staff.getByText(/Standard/).first()).toBeVisible();

  // 3. "Request access" asks the company for a support session with the ticket as the reason.
  await staff.getByRole('button', { name: 'Request access' }).click();
  const dialog = staff.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Reason/ }).fill('Check the leave balance set-up for the Mysuru location');
  await dialog.getByRole('radio', { name: '4 h', exact: true }).click();
  await dialog.getByRole('button', { name: 'Send request' }).click();
  await expect(staff.getByText(/Waiting for the company to approve/).first()).toBeVisible();

  // 4. The company sees the request on its Support access page.
  await admin.goto('/yx/settings/support-access');
  await expect(admin.getByText(/Check the leave balance set-up/).first()).toBeVisible();
});
