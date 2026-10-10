import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Lifecycle batch 6a, main flow on the seeded Kaveri Foods demo: Lakshmi (HR) adds a joiner to Divya's team; the
// checklist starts with tasks due before the joining day; Lakshmi uploads the joiner's PAN card from the checklist and
// verifies it in Documents to verify, which closes the PAN task; Divya sees the joiner under "Joining soon" on My team;
// the IT agent finds the seeded joiner's IT tasks under My checklist tasks.
//
// Needs the API and web against the seeded database (locally: API on 3901, web on 3900 with
// NEXT_PUBLIC_API_BASE=http://localhost:3901/api/v1, WEB_BASE_URL=http://localhost:3900).

const PASSWORD = 'Passw0rd!2026';
// A one-pixel PNG: the API checks the real type from the bytes and virus-checks it before anyone can open it.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function signedIn(browser: import('@playwright/test').Browser, email: string) {
  const page = await (await browser.newContext()).newPage();
  await signIn(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp(email);
  return page;
}

test('HR adds a joiner → uploads and verifies the PAN → the task closes; the manager sees Joining soon; IT sees its tasks', async ({ browser }) => {
  test.setTimeout(300_000);
  const name = `Ravi ${Date.now().toString(36)}`;
  const hr = await signedIn(browser, 'hr@demo-org.test');
  await hr.goto('/yx/people/onboarding');
  await hr.getByRole('button', { name: 'Add joiner' }).click();
  const sheet = hr.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /First name/ }).fill(name.split(' ')[0]);
  await sheet.getByRole('textbox', { name: /Last name/ }).fill(name.split(' ')[1]);
  const target = new Date(Date.now() + 330 * 60_000 + 12 * 86_400_000);
  const joining = target.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  await sheet.getByRole('textbox', { name: 'Joining day' }).fill(joining);
  await sheet.getByRole('textbox', { name: 'Joining day' }).press('Tab');
  await sheet.getByRole('combobox', { name: 'Legal entity' }).click();
  await hr.getByRole('option', { name: /Tamil Nadu/ }).first().click();
  await sheet.getByRole('combobox', { name: 'Location' }).click();
  await hr.getByRole('option', { name: /Hosur/ }).first().click();
  await sheet.getByRole('combobox', { name: 'Manager' }).click();
  await hr.getByRole('option', { name: /Divya Raghunathan/ }).first().click();
  await sheet.getByRole('button', { name: 'Add joiner' }).click();
  await expect(hr.getByText(`${name.split(' ')[0]} was added`)).toBeVisible({ timeout: 30_000 });

  // The checklist: PAN due a week before the joining day; HR uploads it for the joiner.
  await hr.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Checklist' }).click();
  const pan = hr.getByRole('row', { name: /Collect the PAN card/ });
  await expect(pan).toBeVisible();
  await pan.getByRole('button', { name: 'Upload' }).click();
  const up = hr.getByRole('dialog');
  await up.locator('input[type=file]').setInputFiles({ name: 'pan.png', mimeType: 'image/png', buffer: PNG });
  await up.getByRole('button', { name: 'Upload' }).click();
  await expect(up).toHaveCount(0);

  // Documents to verify: Lakshmi verifies the PAN; the automation closes the checklist task.
  await hr.goto('/yx/people/documents');
  const doc = hr.getByRole('row', { name: new RegExp(name) });
  await expect(doc.getByText('Clean')).toBeVisible({ timeout: 30_000 });
  await doc.getByRole('button', { name: 'Verify' }).click();
  await expect(doc).toHaveCount(0);
  await hr.goto('/yx/people/onboarding');
  await hr.getByRole('row', { name: new RegExp(name) }).getByRole('button', { name: 'Checklist' }).click();
  await hr.getByRole('radio', { name: 'All tasks' }).click();
  await expect(async () => {
    await hr.reload();
    await hr.getByRole('radio', { name: 'All tasks' }).click();
    await expect(hr.getByRole('row', { name: /Collect the PAN card/ }).getByText('Done', { exact: true })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 60_000 });

  // Divya sees the joiner on My team; the IT agent sees the seeded joiner's IT tasks.
  const divya = await signedIn(browser, 'panel@demo-org.test');
  await divya.goto('/yx/people/team');
  await expect(divya.getByRole('heading', { name: 'Joining soon' })).toBeVisible();
  await expect(divya.getByText(new RegExp(name))).toBeVisible();
  const it = await signedIn(browser, 'it-agent@demo-org.test');
  await it.goto('/yx/people/my-tasks');
  await expect(it.getByRole('row', { name: /Sneha Pillai.*Laptop or work device|Laptop or work device.*Sneha Pillai/ })).toBeVisible();
});
