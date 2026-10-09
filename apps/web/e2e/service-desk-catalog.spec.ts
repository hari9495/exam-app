import { expect, test, type Page } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// M14 Service Desk, phase 3b-2 batch 1 (SD-2.03 … SD-2.05). Main flow on the seeded Kaveri Foods demo: Arjun orders a
// New laptop from the service catalogue; his manager Divya approves in Approvals, then the cost-centre owner does;
// the request then has its fulfilment tasks for the IT team and the Admin team, and Arjun sees the stages.
//
// Needs the API and web against the seeded database (locally: API on 3411, web on 3410 with
// NEXT_PUBLIC_API_BASE=http://localhost:3411/api/v1, WEB_BASE_URL=http://localhost:3410).

const PASSWORD = 'Passw0rd!2026';

async function choose(page: Page, scope: ReturnType<Page['getByRole']>, combobox: string | RegExp, option: string | RegExp) {
  await scope.getByRole('combobox', { name: combobox }).click();
  await page.getByRole('option', { name: option }).click();
}

async function approveIn(page: Page, title: RegExp) {
  await page.goto('/yx/approvals');
  const cards = page.locator('section').filter({ has: page.getByRole('heading', { name: title }) });
  await expect(cards.first()).toBeVisible();
  const before = await cards.count();
  // Approvers see the summary the request gives them (the newest request is last).
  const card = cards.last();
  await expect(card.getByText('Cost centre that pays')).toBeVisible();
  await card.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(cards).toHaveCount(before - 1);
}

test('order a New laptop → manager approves → cost-centre owner approves → tasks for IT and Admin', async ({ browser }) => {
  test.setTimeout(240_000);

  // 1. Arjun orders the developer laptop.
  const arjun = await (await browser.newContext()).newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/desk/catalog');
  await arjun.getByRole('button', { name: 'Open New laptop' }).click();
  const item = arjun.getByRole('dialog');
  await expect(item.getByText('Approved by: Your manager, then Cost-centre owner.')).toBeVisible();
  // Form rules: the reason appears only for the developer model; the system list depends on the model.
  await expect(item.getByText('Why do you need the developer laptop?')).toHaveCount(0);
  await choose(arjun, item, /^Model/, /Developer 16 inch/);
  await expect(item.getByText('Why do you need the developer laptop?')).toBeVisible();
  await choose(arjun, item, /^System/, 'Linux');
  await item.getByRole('textbox', { name: /Why do you need the developer laptop/ }).fill('I build and test the plant apps.');
  await item.getByRole('textbox', { name: 'Search cost centre that pays' }).fill('Engineering');
  await expect(item.getByRole('combobox', { name: 'Cost centre that pays' })).toBeEnabled();
  await arjun.waitForTimeout(600);
  await choose(arjun, item, 'Cost centre that pays', /Engineering Bengaluru/);
  await item.getByRole('textbox', { name: 'Search deliver to' }).fill('Bengaluru');
  await arjun.waitForTimeout(600);
  await choose(arjun, item, 'Deliver to', /Bengaluru head office/);
  await item.getByRole('button', { name: 'Add to cart' }).click();
  await expect(arjun.getByRole('heading', { name: 'Your cart (1)' })).toBeVisible();
  await arjun.getByRole('button', { name: 'Send request' }).click();
  const follow = arjun.getByRole('button', { name: /Follow IT-\d+/ });
  await expect(follow).toBeVisible();
  const number = (await follow.textContent())!.match(/IT-\d+/)![0];

  // 2. Divya, his manager, approves.
  const divya = await (await browser.newContext()).newPage();
  await signIn(divya, 'panel@demo-org.test', PASSWORD);
  await divya.waitForURL((url) => !url.pathname.includes('sign-in'));
  await approveIn(divya, /New laptop for Arjun Kulkarni/);

  // 3. The owner of the Engineering cost centre approves.
  const owner = await (await browser.newContext()).newPage();
  await signIn(owner, 'payroll@demo-org.test', PASSWORD);
  await owner.waitForURL((url) => !url.pathname.includes('sign-in'));
  await approveIn(owner, /New laptop for Arjun Kulkarni/);

  // 4. Arjun's request now waits on the IT team and the Admin team, each with its own task.
  await follow.click();
  await expect(arjun.getByRole('heading', { name: 'What you ordered' })).toBeVisible();
  await expect(arjun.getByText(/Prepare and set up the laptop: to do/)).toBeVisible();
  await expect(arjun.getByText(/Deliver the laptop and collect the old one: to do/)).toBeVisible();
  await expect(arjun.getByRole('list', { name: 'Stages of New laptop' }).getByText('Being done')).toBeVisible();
  await expect(arjun.getByText(number).first()).toBeVisible();

  // 5. The IT lead sees the ordered item with both approvals and the two teams' tasks on the ticket.
  const lead = await (await browser.newContext()).newPage();
  await signIn(lead, 'it-lead@demo-org.test', PASSWORD);
  await lead.waitForURL((url) => !url.pathname.includes('sign-in'));
  await lead.goto(arjun.url().replace('/yx/desk/help/', '/yx/desk/tickets/'));
  await expect(lead.getByRole('heading', { name: 'Ordered items' })).toBeVisible();
  await expect(lead.getByText(/Prepare and set up the laptop \(open\); Deliver the laptop and collect the old one \(open\)/)).toBeVisible();
});
