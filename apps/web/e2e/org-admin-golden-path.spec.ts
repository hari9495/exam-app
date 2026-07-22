import { test, expect } from '@playwright/test';

const ORG_SLUG = process.env.E2E_ORG_SLUG ?? 'demo-org';
const RECRUITER_EMAIL = process.env.E2E_RECRUITER_EMAIL ?? 'recruiter@demo-org.test';
const RECRUITER_PASSWORD = process.env.E2E_RECRUITER_PASSWORD ?? 'Passw0rd!2026';
const ORG_ADMIN_EMAIL = process.env.E2E_ORG_ADMIN_EMAIL ?? 'admin@demo-org.test';
const ORG_ADMIN_PASSWORD = process.env.E2E_ORG_ADMIN_PASSWORD ?? 'DevAdmin123!';

test('org admin adds a staff member, reviews the audit log, and exports/erases a candidate', async ({ page }) => {
  // Seed a fresh candidate as the recruiter so this test doesn't depend on data from other suites.
  const candidateEmail = `org-admin-e2e-${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(RECRUITER_EMAIL);
  await page.getByLabel('Password').fill(RECRUITER_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole('link', { name: 'Candidates' }).click();
  await page.getByLabel('Name').fill('Org Admin E2E Candidate');
  await page.getByLabel('Email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Add candidate' }).click();
  await expect(page.getByText(candidateEmail)).toBeVisible();

  // Switch to the org admin.
  await page.goto('/login');
  await page.getByLabel('Organization slug').fill(ORG_SLUG);
  await page.getByLabel('Email').fill(ORG_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ORG_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/users/);

  // Add a staff member.
  const staffEmail = `org-admin-e2e-staff-${Date.now()}@example.com`;
  await page.getByLabel('Email').fill(staffEmail);
  await page.getByLabel('Password').fill('Passw0rd!2026');
  await page.getByLabel('Role').click();
  await page.getByRole('option', { name: 'Recruiter' }).click();
  await page.getByRole('button', { name: 'Add staff member' }).click();
  // The success toast also renders the email, so scope to the staff card (CardGrid
  // has no table semantics -- the toast isn't inside a .group card) to disambiguate.
  await expect(page.locator('.group', { hasText: staffEmail }).getByText(staffEmail, { exact: true })).toBeVisible();

  // Confirm the new staff member shows up in the audit log.
  await page.getByRole('link', { name: 'Audit Log' }).click();
  await page.getByLabel('Action').fill('user.created');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByText('user.created').first()).toBeVisible();

  // Look up, export, and erase the candidate seeded above.
  await page.getByRole('link', { name: 'Candidate Data Rights' }).click();
  await page.getByLabel('Candidate email').fill(candidateEmail);
  await page.getByRole('button', { name: 'Look up' }).click();
  await expect(page.getByText('Org Admin E2E Candidate')).toBeVisible();
  await page.getByRole('button', { name: 'Export data' }).click();
  await expect(page.getByText('Profile')).toBeVisible();
  await page.getByRole('button', { name: 'Erase candidate' }).click();
  // "Confirm erase" stays disabled until the candidate's email is typed into the
  // confirmation field (apps/web/app/(org-admin)/data-rights/page.tsx's eraseConfirmed check).
  await page.getByLabel("Type the candidate's email to confirm").fill(candidateEmail);
  await page.getByRole('button', { name: 'Confirm erase' }).click();
  await expect(page.getByText(/Erased at/)).toBeVisible();
});
