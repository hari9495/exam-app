import { test, expect } from '@playwright/test';

// Validation 8 Oct 2026 (Area 1, Medium): the auth screens ignored the OS dark setting, and on a 390 px phone
// the small buttons ("Change", "Email me a code instead") and inputs were under the 44 px touch rule (DESIGN §36).

test.describe('OS dark mode', () => {
  test.use({ colorScheme: 'dark' });
  test('the sign-in page is dark when the OS is, before anyone can open the account menu', async ({ page }) => {
    await page.goto('/yx/sign-in');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const bg = await page.locator('.yx-portal').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).toBe('rgb(11, 18, 32)'); // --yx-slate-900
  });
});

test.describe('phone touch targets', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('inputs and small buttons are at least 44 px tall at 390 px', async ({ page }) => {
    await page.goto('/yx/sign-in');
    const email = page.getByLabel(/Work email/);
    expect((await email.locator('xpath=..').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await email.fill('touch.target@demo-org.test');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const change = page.getByRole('button', { name: 'Change', exact: true });
    await expect(change).toBeVisible();
    expect((await change.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect((await page.getByLabel(/^Password/).locator('xpath=..').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});

// Founder review 19 Oct 2026: the sign-in page scrolled on a laptop (1920 × 1080 at 125 % shows 1536 × 730).
test.describe('laptop screen', () => {
  test.use({ viewport: { width: 1536, height: 730 } });
  test('the sign-in page fits without scrolling', async ({ page }) => {
    await page.goto('/yx/sign-in');
    await expect(page.getByRole('button', { name: 'Sign in with a passkey' })).toBeVisible();
    await expect(page.getByText('Powered by')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(730);
  });
});
