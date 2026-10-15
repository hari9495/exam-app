import type { Page } from '@playwright/test';

// Company accounts sign in on the YukthiX page; the classic /login page is retired (7 Oct 2026).
// Sign-in is rate-limited per account (10 a minute, CredentialThrottle) at the email and the password step. A shard
// signs the demo admin in more often than that, so a "Too many tries" answer at either step waits out the window and
// tries again (twice at most); the limit itself stays as it is.
export async function signIn(page: Page, email: string, password: string) {
  const limited = page.getByText(/^Too many tries\./);
  for (let attempt = 0; ; attempt++) {
    const waitOut = async () => {
      if (attempt >= 2) throw new Error(`Sign-in for ${email} is still rate-limited after waiting twice.`);
      await page.waitForTimeout(61_000);
    };
    await page.goto('/yx/sign-in');
    await page.getByLabel(/Work email/).fill(email);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const password_ = page.getByLabel(/^Password/);
    await password_.or(limited).first().waitFor({ timeout: 30_000 });
    if (await limited.isVisible()) {
      await waitOut();
      continue;
    }
    await password_.fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // Either the app opens, or the password step answers "Too many tries".
    const outcome = await Promise.race([
      page.waitForURL((url) => !url.pathname.startsWith('/yx/sign-in'), { timeout: 30_000 }).then(() => 'in' as const),
      limited.waitFor({ timeout: 30_000 }).then(() => 'limited' as const),
    ]).catch(() => 'unknown' as const);
    if (outcome === 'limited') {
      await waitOut();
      continue;
    }
    // Roles that must set up a second step are asked to on sign-in while their grace period runs (the seed gives
    // two weeks). The walk-throughs are not about enrolment: put it off, as a person may, and carry on.
    if (outcome === 'in' && new URL(page.url()).pathname.startsWith('/yx/setup-mfa')) await page.getByRole('button', { name: 'Remind me later' }).click();
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
