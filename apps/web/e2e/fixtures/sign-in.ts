import type { Page } from '@playwright/test';

// Company accounts sign in on the YukthiX page; the classic /login page is retired (7 Oct 2026).
// The sign-in steps are rate-limited per account (10 a minute, CredentialThrottle). Specs run back to back sign the
// demo admin in more often than that, so a "Too many tries" answer waits out the window once and tries again; the
// limit itself stays as it is.
export async function signIn(page: Page, email: string, password: string) {
  for (let attempt = 0; ; attempt++) {
    await page.goto('/yx/sign-in');
    await page.getByLabel(/Work email/).fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const password_ = page.getByLabel(/^Password/);
    const limited = page.getByText('Too many tries. Wait a minute and try again.');
    await password_.or(limited).first().waitFor({ timeout: 30_000 });
    if (await limited.isVisible()) {
      if (attempt >= 1) throw new Error(`Sign-in for ${email} is still rate-limited after waiting a minute.`);
      await page.waitForTimeout(61_000);
      continue;
    }
    await password_.fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Roles that must set up a second step are asked to on sign-in while their grace period runs (the seed gives
    // two weeks). The walk-throughs are not about enrolment: put it off, as a person may, and carry on.
    const remindLater = page.getByRole('button', { name: 'Remind me later' });
    const leftSignIn = await page.waitForURL((url) => !url.pathname.startsWith('/yx/sign-in'), { timeout: 15_000 }).then(() => true, () => false);
    if (leftSignIn && new URL(page.url()).pathname.startsWith('/yx/setup-mfa')) await remindLater.click();
    return;
  }
}

// YukthiX platform staff sign in on their own page, then their security key.
export async function staffSignIn(page: Page, email: string, password: string) {
  await page.goto('/staff/sign-in');
  await page.getByLabel(/Staff email/).fill(email);
  await page.getByLabel(/^Password/).fill(password);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
}
