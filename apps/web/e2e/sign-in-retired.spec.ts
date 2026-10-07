import { test, expect } from '@playwright/test';

// The classic sign-in is retired (founder decision 7 Oct 2026): its routes land on the YukthiX pages,
// and platform staff have their own page that nothing on the company screens links to.
test.describe('classic sign-in retired', () => {
  for (const [from, to] of [
    ['/login?next=/v2/questions', /\/yx\/sign-in\?next=%2Fv2%2Fquestions$/],
    ['/v2/login', /\/yx\/sign-in$/],
    ['/forgot-password', /\/yx\/forgot-password$/],
    ['/reset-password/0123abcd', /\/yx\/reset-password\/0123abcd$/],
  ] as const) {
    test(`${from} lands on the YukthiX page`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByText('Workfox')).toHaveCount(0);
      await expect(page.getByLabel(/Organization/)).toHaveCount(0);
    });
  }

  test('the company sign-in never links to the staff page', async ({ page }) => {
    await page.goto('/yx/sign-in');
    await expect(page.getByLabel(/Work email/)).toBeVisible();
    await expect(page.locator('a[href*="/staff"]')).toHaveCount(0);
  });

  test('the staff page asks for a staff email and password, and is kept out of search', async ({ page }) => {
    await page.goto('/staff/sign-in');
    await expect(page.getByRole('heading', { level: 1, name: 'YukthiX staff sign-in' })).toBeVisible();
    await expect(page.getByLabel(/Staff email/)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  });

  test('a signed-out visit to a console page goes to the YukthiX sign-in', async ({ page }) => {
    await page.goto('/v2/users');
    await expect(page).toHaveURL(/\/yx\/sign-in/);
  });
});
