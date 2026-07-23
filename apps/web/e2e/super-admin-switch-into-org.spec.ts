import { test, expect } from '@playwright/test';

const ORG_NAME = process.env.E2E_ORG_NAME ?? 'Demo Org';
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'super@platform.test';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'DevSuper123!';

test('super_admin switches into an org, drives the recruiter and org-admin shells, then exits with elevation genuinely ended', async ({ page }) => {
  // Log in as super_admin -- no organization slug, per the staff login form's own handling
  // of a platform-level account.
  await page.goto('/login');
  await page.getByLabel('Email').fill(SUPER_ADMIN_EMAIL);
  await page.getByLabel('Password').fill(SUPER_ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/organizations/);

  // Switch into a real org.
  await page.getByLabel('Search organizations').fill(ORG_NAME);
  await page
    .locator('.group', { hasText: ORG_NAME })
    .getByRole('button', { name: 'Switch into' })
    .click();
  await expect(page).toHaveURL(/\/dashboard/);

  // The amber acting banner is visible (naming the org switched into) and the recruiter
  // dashboard rendered.
  await expect(page.getByText(new RegExp(`Viewing as super_admin.*${ORG_NAME}`))).toBeVisible();

  // Navigate via the acting nav to a recruiter-only page.
  await page.getByRole('link', { name: 'Question Bank' }).click();
  await expect(page).toHaveURL(/\/questions/);
  await expect(page.getByRole('heading', { name: 'Question Bank' })).toBeVisible();
  await expect(page.getByText(/Viewing as super_admin/)).toBeVisible();

  // Navigate via the acting-extra nav to an org-admin-only page.
  await page.getByRole('link', { name: 'Staff Users' }).click();
  await expect(page).toHaveURL(/\/users/);
  await expect(page.getByRole('heading', { name: 'Staff Users' })).toBeVisible();
  await expect(page.getByText(/Viewing as super_admin/)).toBeVisible();

  // Exit acting mode.
  await page.getByRole('button', { name: 'Exit to platform admin' }).click();
  await expect(page).toHaveURL(/\/organizations/);
  await expect(page.getByText(/Viewing as super_admin/)).not.toBeVisible();

  // The elevation genuinely ended -- a direct visit to the recruiter-only page now redirects
  // to /login rather than rendering (no acting token, and the platform role has no baseline
  // access to a recruiter route).
  await page.goto('/questions');
  await expect(page).toHaveURL(/\/login/);
});
