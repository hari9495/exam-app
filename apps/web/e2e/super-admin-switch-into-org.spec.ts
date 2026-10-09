import { test, expect } from '@playwright/test';
import { staffSignIn } from './fixtures/sign-in';
import { approvedSupportSession } from './fixtures/console-db';

const ORG_NAME = process.env.E2E_ORG_NAME ?? 'Kaveri Foods';
const SUPER_ADMIN_EMAIL = process.env.E2E_SUPER_ADMIN_EMAIL ?? 'super@platform.test';
const SUPER_ADMIN_PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD ?? 'DevSuper123!';

test('super_admin switches into an org, drives the recruiter and org-admin shells, then exits with elevation genuinely ended', async ({ page }) => {
  // Platform staff sign in on their own page (no company); an account without a security key yet
  // is in its set-up grace period and continues to the console.
  await staffSignIn(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
  await expect(page).toHaveURL(/\/yx\/setup-mfa|\/staff\/companies/);
  await page.goto('/v2/organizations');

  // Switch into a real org: only inside a support session the company approved (P02 Q8, step 3).
  await approvedSupportSession(SUPER_ADMIN_EMAIL, ORG_NAME);
  await page.getByLabel(/Search organizations/).fill(ORG_NAME);
  // The row's actions menu (the "…" at the end of the row), then Switch into.
  await page.getByRole('row', { name: new RegExp(ORG_NAME) }).getByRole('cell').last().locator('[style*="cursor"]').first().click();
  await page.getByText('Switch into', { exact: true }).click();
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

  // Exit acting mode: back to the console's support sessions.
  await page.getByRole('button', { name: 'Exit to platform admin' }).click();
  await expect(page).toHaveURL(/\/staff\/support/);
  await expect(page.getByText(/Viewing as super_admin/)).not.toBeVisible();

  // The elevation genuinely ended -- a direct visit to the recruiter-only page now redirects
  // away rather than rendering (no acting token, and the platform role has no baseline
  // access to a recruiter route).
  await page.goto('/questions');
  await expect(page).not.toHaveURL(/\/questions/);
});
