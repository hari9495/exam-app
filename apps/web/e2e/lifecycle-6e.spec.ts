import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';
import { stepUp } from './fixtures/time-db';

// Lifecycle batch 6e on the seeded Kaveri Foods demo, as Lakshmi (HR): writes a letter in the editor tab (saved as a
// Word draft), makes a campus batch, adds a fresh joiner to it and moves the batch day (the joiner moves too), and
// records a government permission request for a retrenchment with its decision. Every run makes its own names, so the
// test can run again. Rehire, death, absconding, contract ends, retrenchment approval and VRS run in the API e2e.

const PASSWORD = 'Passw0rd!2026';

async function pick(page: import('@playwright/test').Page, scope: import('@playwright/test').Locator, label: string, option: RegExp) {
  await scope.getByRole('combobox', { name: label }).click();
  await page.getByRole('option', { name: option }).first().click();
}
const ddMmmYyyy = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

test('letter editor → campus batch moves its joiner → retrenchment permission', async ({ browser }) => {
  test.setTimeout(300_000);
  const tag = Date.now().toString(36);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const hr = await (await browser.newContext()).newPage();
  await signIn(hr, 'hr@demo-org.test', PASSWORD);
  await hr.waitForURL((url) => !url.pathname.includes('sign-in'));
  await stepUp('hr@demo-org.test');

  // The editor tab: a letter written in YukthiX, saved as a Word draft.
  await hr.goto('/yx/settings/letters');
  await hr.getByRole('button', { name: 'Write a letter' }).click();
  const ed = hr.getByRole('dialog');
  await ed.getByRole('textbox', { name: /Letter type/ }).fill(`note_${tag}`);
  await ed.getByRole('textbox', { name: /^Name/ }).fill(`Note ${tag}`);
  await ed.getByRole('textbox', { name: 'Paragraph 2' }).fill('Dear {{employee_name}}, thank you for your work this year.');
  await ed.getByRole('button', { name: 'Save as a draft' }).click();
  await expect(ed).toHaveCount(0);
  await expect(hr.getByRole('row', { name: new RegExp(`Note ${tag}`) })).toBeVisible();

  // A fresh joiner, then a batch; adding them moves them to the batch day; moving the batch moves them again.
  const first = `Camp${tag}`;
  await hr.goto('/yx/people/onboarding');
  await hr.getByRole('button', { name: 'Add joiner' }).click();
  const sheet = hr.getByRole('dialog');
  await sheet.getByRole('textbox', { name: /First name/ }).fill(first);
  await sheet.getByRole('textbox', { name: 'Joining day' }).fill(ddMmmYyyy(addDays(today, 40)));
  await sheet.getByRole('textbox', { name: 'Joining day' }).press('Tab');
  await pick(hr, sheet, 'Legal entity', /Tamil Nadu/);
  await pick(hr, sheet, 'Location', /Hosur/);
  await sheet.getByRole('button', { name: 'Add joiner' }).click();
  await expect(hr.getByText(`${first} was added`)).toBeVisible({ timeout: 30_000 });

  await hr.goto('/yx/people/batches');
  await hr.getByRole('button', { name: 'New batch' }).click();
  const nb = hr.getByRole('dialog');
  await nb.getByRole('textbox', { name: /^Name/ }).fill(`Campus ${tag}`);
  await pick(hr, nb, 'Legal entity', /Tamil Nadu/);
  await nb.getByRole('textbox', { name: 'Joining day' }).fill(ddMmmYyyy(addDays(today, 30)));
  await nb.getByRole('textbox', { name: 'Joining day' }).press('Tab');
  await nb.getByRole('button', { name: 'Save batch' }).click();
  await expect(nb).toHaveCount(0);
  const card = hr.locator('section').filter({ has: hr.getByRole('heading', { name: new RegExp(`Campus ${tag}`) }) });
  await card.getByRole('button', { name: 'Add joiners' }).click();
  const add = hr.getByRole('dialog');
  await add.getByRole('checkbox', { name: new RegExp(first) }).click();
  await add.getByRole('button', { name: 'Add joiners' }).click();
  await expect(card.getByText(new RegExp(first))).toBeVisible();
  await card.getByRole('button', { name: 'Change' }).click();
  const ch = hr.getByRole('dialog');
  await ch.getByRole('textbox', { name: 'Joining day' }).fill(ddMmmYyyy(addDays(today, 35)));
  await ch.getByRole('textbox', { name: 'Joining day' }).press('Tab');
  await ch.getByRole('textbox', { name: /Why the day moves/ }).fill('Exams moved');
  await ch.getByRole('button', { name: 'Save batch' }).click();
  await expect(ch).toHaveCount(0);
  await hr.goto('/yx/people/onboarding');
  await expect(hr.getByRole('row', { name: new RegExp(first) }).getByText(ddMmmYyyy(addDays(today, 35)).replace(/^0/, ''))).toBeVisible();

  // Retrenchment: a permission request and the government's decision.
  await hr.goto('/yx/people/retrenchment');
  await hr.getByRole('button', { name: 'Record a permission request' }).click();
  const ir = hr.getByRole('dialog');
  await pick(hr, ir, 'Legal entity', /Tamil Nadu/);
  await ir.getByRole('textbox', { name: /Workers affected/ }).fill('12');
  await ir.getByRole('textbox', { name: /Authority/ }).fill(`Labour Department ${tag}`);
  await ir.getByRole('textbox', { name: /Reasons/ }).fill('A production line closes');
  await ir.getByRole('button', { name: 'Save request' }).click();
  await expect(ir).toHaveCount(0);
  const req = hr.getByRole('listitem').filter({ hasText: `Labour Department ${tag}` });
  await req.getByRole('button', { name: 'Record the decision' }).click();
  await hr.getByRole('dialog').getByRole('button', { name: 'Save decision' }).click();
  await expect(req.getByText('Granted')).toBeVisible();
});
