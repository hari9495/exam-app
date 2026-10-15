import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// Batch G1 on the seeded Kaveri Foods demo: the System Admin adds an India entity through the "Add a country"
// guide and translates a leave name; Arjun picks Tamil and sees his leave names in Tamil; HR sees hours a week
// and the service dates on Arjun's job record and sets continuous service with a reason. Every run makes its
// own names, so the test can run again.

const PASSWORD = 'Passw0rd!2026';

test('Add a country → translations → my language → hours and service dates', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36).slice(-5).toUpperCase();

  // 1. The guide: India from its pack, a new entity, its week and language, then finished with items open.
  const admin = await (await browser.newContext()).newPage();
  await signIn(admin, 'admin@demo-org.test', 'DevAdmin123!');
  await admin.waitForURL((url) => !url.pathname.includes('sign-in'));
  await admin.goto('/yx/settings/countries');
  await expect(admin.getByRole('list', { name: 'Your countries' }).getByText('India · Kaveri Foods Pvt Ltd', { exact: true })).toBeVisible({ timeout: 30_000 });
  await admin.getByRole('button', { name: 'Add a country', exact: true }).click();
  await expect(admin.getByText(/48 hours \(the legal limit/)).toBeVisible();
  const guide = admin.getByLabel('Add a country: India');
  await guide.getByRole('button', { name: 'Start the guide', exact: true }).click();
  await admin.getByRole('textbox', { name: /Registered name/ }).fill(`Kaveri South ${tag}`);
  await admin.getByRole('textbox', { name: /Short name/ }).fill(`KS-${tag}`);
  await guide.getByRole('button', { name: 'Add legal entity', exact: true }).click();
  const ids = admin.getByRole('list', { name: 'Identifiers and registrations' });
  await expect(ids.getByText('PAN on file')).toBeVisible();
  await expect(ids.getByRole('link', { name: 'Fix: PF registration decided' })).toHaveAttribute('href', '/yx/payroll/setup');
  await guide.getByRole('button', { name: 'Continue', exact: true }).click();
  await guide.getByRole('radio', { name: 'தமிழ் (Tamil)' }).click();
  await guide.getByRole('button', { name: 'Save working week and language', exact: true }).click();
  await expect(admin.getByText('Saved for this legal entity.')).toBeVisible();
  await guide.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(admin.getByRole('list', { name: 'What is still open' }).getByText('At least one location')).toBeVisible();
  await guide.getByRole('button', { name: 'Finish the guide', exact: true }).click();
  await expect(admin.getByRole('list', { name: 'Your countries' }).getByText(`India · Kaveri South ${tag}`)).toBeVisible();

  // 2. Translations: Casual leave in Tamil.
  await admin.goto('/yx/settings/translations');
  await admin.getByRole('button', { name: 'Translate Casual leave', exact: true }).click();
  const tr = admin.getByRole('dialog');
  await tr.getByRole('textbox', { name: /Tamil/ }).fill(`தற்செயல் விடுப்பு ${tag}`);
  await tr.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(tr).toHaveCount(0);
  await expect(admin.getByText(`தற்செயல் விடுப்பு ${tag}`)).toBeVisible();

  // 3. Arjun picks Tamil; My leave shows the company's leave names in Tamil.
  const arjun = await (await browser.newContext()).newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/me/language');
  await arjun.getByRole('radio', { name: 'தமிழ் (Tamil)' }).click();
  await arjun.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(arjun.getByText(/Saved\. Company words now show in தமிழ்/)).toBeVisible();
  await arjun.goto('/yx/time/leave');
  await expect(arjun.getByText(`தற்செயல் விடுப்பு ${tag}`).first()).toBeVisible({ timeout: 30_000 });
  await expect(arjun.getByText('ஈட்டிய விடுப்பு').first()).toBeVisible();
  await arjun.goto('/yx/me/language');
  await arjun.getByRole('radio', { name: 'English' }).click();
  await arjun.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(arjun.getByText(/Saved\. Company words now show in English/)).toBeVisible();

  // 4. HR: hours a week and the service dates on Arjun's record; continuous service set with a reason.
  const hr = await (await browser.newContext()).newPage();
  await signIn(hr, 'hr@demo-org.test', PASSWORD);
  await hr.waitForURL((url) => !url.pathname.includes('sign-in'));
  await hr.goto('/yx/people/history');
  await hr.getByRole('combobox', { name: 'Person' }).click();
  await hr.getByRole('option', { name: /Arjun Kulkarni/ }).first().click();
  await expect(hr.getByText('Full-time (48 hours)')).toBeVisible({ timeout: 30_000 });
  await expect(hr.getByText('Company start')).toBeVisible();
  await hr.getByRole('button', { name: 'Edit continuous service', exact: true }).click();
  const sd = hr.getByRole('dialog');
  await sd.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sd.getByText('Enter the reason for the new dates').first()).toBeVisible();
  await sd.getByRole('textbox', { name: /Reason/ }).fill(`Checked ${tag}`);
  await sd.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sd).toHaveCount(0);
  await expect(hr.getByText(/From the joining day/)).toBeVisible();
});
