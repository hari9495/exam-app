import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { staffSignIn, signIn } from './fixtures/sign-in';
import { cleanUp, createStaff, setCompanyAdminPassword } from './fixtures/console-db';

// Step 3, the YukthiX platform console, main flow: a staff member signs in with a security key, creates a company
// (trial), asks it for support access; the company's System Admin approves (confirming with a passkey); the staff
// member opens the company read-only, leaves; the company sees what was opened; the audit log has it all.
//
// Needs the API and web against the same database (README; locally: API on 3101, web on 3100 with
// NEXT_PUBLIC_API_BASE=http://localhost:3101/api/v1, WEB_BASE_URL=http://localhost:3100). Security keys and passkeys
// are Chromium virtual authenticators.

const run = randomUUID().slice(0, 8);
const STAFF = { email: `e2e-staff-${run}@platform.test`, password: `Staff-Passw0rd-${run}` };
const COMPANY = { name: `Narmada Mills ${run}`, slug: `narmada-${run}`, admin: `admin-${run}@narmada.test`, password: `Admin-Passw0rd-${run}` };
let staffId: string | null = null;

/** A virtual authenticator on this page: a USB security key that always verifies the user. */
async function virtualKey(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
}

test.beforeAll(async () => {
  staffId = await createStaff(STAFF.email, STAFF.password);
});
test.afterAll(async () => {
  await cleanUp(staffId, COMPANY.slug);
});

test('staff create a company, the company approves support access, staff look read-only and every step is recorded', async ({ browser }) => {
  test.setTimeout(180_000);
  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  await virtualKey(staff);

  // 1. Staff sign in; a first security key is set up before the console opens.
  await staffSignIn(staff, STAFF.email, STAFF.password);
  await expect(staff).toHaveURL(/\/yx\/setup-mfa/);
  await staff.getByRole('button', { name: /Passkey/ }).click();
  await expect(staff).toHaveURL(/\/staff\/companies/);
  await expect(staff.getByRole('heading', { name: 'Companies' })).toBeVisible();

  // 2. A new company starts a 30-day trial.
  await staff.getByRole('button', { name: 'New company' }).first().click();
  const drawer = staff.getByRole('dialog');
  await drawer.getByRole('textbox', { name: /Company name/ }).fill(COMPANY.name);
  await drawer.getByRole('textbox', { name: /Company code/ }).fill(COMPANY.slug);
  await drawer.getByRole('checkbox', { name: /YukthiX HR/ }).click();
  await drawer.getByRole('textbox', { name: /^Name/ }).fill('Rekha Joshi');
  await drawer.getByRole('textbox', { name: /Work email/ }).fill(COMPANY.admin);
  await drawer.getByRole('button', { name: 'Create company' }).click();
  await expect(staff).toHaveURL(/\/staff\/companies\/[0-9a-f-]{36}$/);
  await expect(staff.getByRole('heading', { name: COMPANY.name })).toBeVisible();
  await expect(staff.getByText('Trial', { exact: true }).first()).toBeVisible();

  // 3. Staff ask for 4 hours of support access.
  await staff.getByRole('button', { name: 'Ask for support access' }).click();
  const ask = staff.getByRole('dialog');
  await ask.getByRole('textbox', { name: /Why you need to look/ }).fill('Checking the legal entity set-up for ticket E2E-1');
  await ask.getByRole('radio', { name: '4 hours', exact: true }).click();
  await ask.getByRole('button', { name: 'Send request to the company' }).click();
  await expect(staff.getByText('Waiting for the company to approve')).toBeVisible();

  // 4. The company's System Admin signs in, adds a passkey and approves (the step-up asks for the passkey).
  await setCompanyAdminPassword(COMPANY.admin, COMPANY.password);
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await virtualKey(admin);
  await signIn(admin, COMPANY.admin, COMPANY.password);
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));
  await admin.goto('/yx/me/security');
  await admin.getByRole('list', { name: 'Sign-in methods you can add' }).getByRole('button', { name: /Passkey/ }).click();
  await admin.getByRole('checkbox', { name: 'I have saved my recovery codes' }).click();
  await admin.getByRole('button', { name: 'Done' }).click();
  await admin.goto('/yx/settings/support-access');
  await admin.getByRole('button', { name: 'Review' }).click();
  await expect(admin.getByRole('dialog')).toContainText('Checking the legal entity set-up');
  await admin.getByRole('button', { name: 'Approve for 4 hours' }).click();
  // Letting someone in is a step-up: the passkey again.
  await admin.getByRole('dialog', { name: "Confirm it's you" }).getByRole('button', { name: /Passkey/ }).click();
  await expect(admin.getByText(/can look at your company until/)).toBeVisible();

  // 5. Staff open the company: read-only, with the banner; then leave back to the console.
  await staff.reload();
  await staff.getByRole('button', { name: 'Open company' }).click();
  await expect(staff).toHaveURL(/\/yx\/settings\/legal-entities/);
  await expect(staff.getByText(new RegExp(`Support session in ${COMPANY.name}`))).toBeVisible();
  await expect(staff.getByText(COMPANY.name).first()).toBeVisible();
  await staff.getByRole('button', { name: 'Leave the company' }).click();
  await expect(staff).toHaveURL(/\/staff\/support/);

  // 6. The company sees every page that was opened.
  await admin.reload();
  await admin.getByRole('button', { name: 'Activity' }).first().click();
  await expect(admin.getByText('Opened /org/legal-entities').first()).toBeVisible();

  // 7. The platform audit log has the company's creation and the approval.
  await staff.goto('/staff/audit');
  await expect(staff.getByText('Created the company').first()).toBeVisible();
  await expect(staff.getByText('Approved the support session for 4 hours').first()).toBeVisible();

  await adminContext.close();
  await staffContext.close();
});
