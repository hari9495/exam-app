import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Recruitment batch AT4 on the seeded demo: the older candidates page redirects to Hiring › Candidates; a candidate is
// added and opened; a duplicate (same phone, typed differently) shows in Possible duplicates and is merged; the
// retention preview changes nothing. Needs the API and web against a seeded database.

const tag = Date.now().toString(36);
const digits = `9${String(Date.now()).slice(-9)}`; // a phone number no earlier run used

test('candidates on YukthiX Hiring: list, add, profile, duplicates, merge, retention preview', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, 'admin@demo-org.test', 'DevAdmin123!');
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));

  await page.goto('/v2/candidates');
  await page.waitForURL(/\/yx\/hiring\/candidates$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Candidates', level: 1 })).toBeVisible({ timeout: 30_000 });

  for (const [name, email, phone] of [[`Kavya ${tag}`, `kavya-${tag}@example.test`, `${digits.slice(0, 5)} ${digits.slice(5)}`], [`Kavya N ${tag}`, `kavya.n-${tag}@example.test`, `+91 ${digits.slice(0, 5)}-${digits.slice(5)}`]]) {
    await page.getByRole('button', { name: 'Add candidate' }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel(/^Name/).fill(name);
    await d.getByLabel(/^Email/).fill(email);
    await d.getByLabel(/^Phone/).fill(phone);
    await d.getByRole('button', { name: 'Add candidate' }).click();
    await expect(d).toHaveCount(0, { timeout: 30_000 });
  }

  await page.getByLabel('Search candidates').fill(tag);
  await expect(page.getByRole('cell', { name: `Kavya N ${tag}`, exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto('/yx/hiring/duplicates');
  const row = page.getByRole('row').filter({ hasText: `kavya-${tag}@example.test` }).filter({ hasText: `kavya.n-${tag}@example.test` });
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText('Same phone');
  await row.getByRole('button', { name: 'Compare and merge' }).click();
  const m = page.getByRole('dialog');
  await m.getByRole('radio', { name: `kavya-${tag}@example.test` }).click();
  await m.getByRole('button', { name: 'Merge' }).click();
  await expect(m).toHaveCount(0, { timeout: 30_000 });
  await expect(page.getByRole('row').filter({ hasText: `kavya-${tag}@example.test` })).toHaveCount(0, { timeout: 30_000 });

  await page.goto('/yx/hiring/candidates');
  await page.getByLabel('Search candidates').fill(tag);
  const kept = page.getByRole('row').filter({ hasText: `kavya-${tag}@example.test` });
  await kept.getByRole('button', { name: 'Open' }).click();
  await page.waitForURL(/\/yx\/hiring\/candidates\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/Another candidate was merged into this one/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Kept until/)).toBeVisible();

  await page.goto('/yx/hiring/retention');
  await page.getByRole('button', { name: 'Preview (changes nothing)' }).click();
  await expect(page.getByText(/Today it would send/)).toBeVisible({ timeout: 30_000 });
});
