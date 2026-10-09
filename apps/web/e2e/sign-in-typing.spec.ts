import { test, expect, type Page } from '@playwright/test';

// Validation 8 Oct 2026 (Area 1, High): the first keystroke in every sign-in text box was lost and a pasted
// value wiped. FormField's "no error while typing" state was set in React's capture phase, which flushed a
// re-render of the controlled input (value '') before the input's own onChange ran. These type straight after
// the page loads, without waiting for hydration or the API, so a regression shows as a missing first letter.
const EMAIL = 'first.letter@demo-org.test';

async function typesWhole(page: Page, label: RegExp) {
  const field = page.getByLabel(label);
  await field.click();
  await page.keyboard.type(EMAIL, { delay: 20 });
  await expect(field).toHaveValue(EMAIL);
  // A pasted / autofilled value arrives as one input event.
  await field.fill('pasted@demo-org.test');
  await expect(field).toHaveValue('pasted@demo-org.test');
}

test('sign-in: the work email keeps every letter typed right after load', async ({ page }) => {
  await page.goto('/yx/sign-in', { waitUntil: 'commit' });
  await typesWhole(page, /Work email/);
});

test('forgot password: the work email keeps every letter typed right after load', async ({ page }) => {
  await page.goto('/yx/forgot-password', { waitUntil: 'commit' });
  await typesWhole(page, /Work email/);
});

test('sign-in: the password box keeps the first letter and a pasted value', async ({ page }) => {
  await page.goto('/yx/sign-in');
  await page.getByLabel(/Work email/).fill(EMAIL);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const password = page.getByLabel(/^Password/);
  await password.click();
  await page.keyboard.type('Secret-123', { delay: 20 });
  await expect(password).toHaveValue('Secret-123');
  await password.fill('Pasted-456');
  await expect(password).toHaveValue('Pasted-456');
});
