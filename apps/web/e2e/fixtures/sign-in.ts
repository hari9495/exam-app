import type { Page } from '@playwright/test';

// Company accounts sign in on the YukthiX page; the classic /login page is retired (7 Oct 2026).
export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/yx/sign-in');
  await page.getByLabel(/Work email/).fill(email);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}

// YukthiX platform staff sign in on their own page, then their security key.
export async function staffSignIn(page: Page, email: string, password: string) {
  await page.goto('/staff/sign-in');
  await page.getByLabel(/Staff email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}
