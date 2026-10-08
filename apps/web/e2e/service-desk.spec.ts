import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './fixtures/sign-in';

// M14 Service Desk, phase 3b-1 batch 1, main flow on the seeded Kaveri Foods demo: an employee raises a ticket in the
// Help centre; an IT agent takes it, replies and resolves it; the employee sees the reply and the new status, and never
// the agent's internal note.
//
// Needs the API and web against the seeded database (locally: API on 3401, web on 3400 with
// NEXT_PUBLIC_API_BASE=http://localhost:3401/api/v1, WEB_BASE_URL=http://localhost:3400).

const PASSWORD = 'Passw0rd!2026';
const subject = `Cannot reach the intranet ${randomUUID().slice(0, 6)}`;

test('raise → assign → reply → resolve', async ({ browser }) => {
  test.setTimeout(180_000);

  // 1. Divya (an employee) raises a ticket with the IT desk.
  const employee = await (await browser.newContext()).newPage();
  await signIn(employee, 'panel@demo-org.test', PASSWORD);
  await employee.waitForURL((url) => !url.pathname.includes('sign-in'));
  await employee.goto('/yx/desk/help');
  await employee.getByRole('button', { name: 'Raise a ticket' }).click();
  const raise = employee.getByRole('dialog');
  await raise.getByRole('combobox', { name: /Which team/ }).click();
  await employee.getByRole('option', { name: 'IT help desk' }).click();
  await raise.getByRole('combobox', { name: /What is it about/ }).click();
  await employee.getByRole('option', { name: /Access and accounts/ }).click();
  await raise.getByRole('textbox', { name: /Subject/ }).fill(subject);
  await raise.getByRole('textbox', { name: /Details/ }).fill('The intranet says access denied since this morning.');
  await raise.getByRole('radio', { name: 'Today' }).click();
  await raise.getByRole('button', { name: 'Raise ticket' }).click();
  await expect(employee.getByText(/Your ticket number is IT-\d+/)).toBeVisible();
  const number = (await employee.getByText(/Your ticket number is IT-\d+/).textContent())!.match(/IT-\d+/)![0];
  await expect(employee.getByRole('button', { name: subject })).toBeVisible();

  // 2. Suresh (IT agent) finds it, takes it, adds a note and replies.
  const agent = await (await browser.newContext()).newPage();
  await signIn(agent, 'it-agent@demo-org.test', PASSWORD);
  await agent.waitForURL(/\/yx\/desk\/tickets/);
  await agent.getByRole('button', { name: /View:/ }).click();
  await agent.getByRole('menuitemradio', { name: 'All open' }).or(agent.getByRole('menuitem', { name: 'All open' })).click();
  await agent.getByRole('textbox', { name: /Search/ }).fill(number);
  await agent.getByText(subject).click();
  await expect(agent.getByRole('heading', { name: subject })).toBeVisible();
  const take = agent.getByRole('button', { name: 'Assign to me' });
  if (await take.isVisible()) await take.click();
  await expect(agent.getByRole('combobox', { name: 'Owner', exact: true })).toContainText('Suresh Pillai (me)');

  await agent.getByRole('tab', { name: 'Internal note' }).click();
  await agent.locator('.ProseMirror').click();
  await agent.keyboard.type('Checked the proxy logs: her account is not in the intranet group.');
  await agent.getByRole('button', { name: 'Add note' }).click();
  await expect(agent.getByText('Internal note: Divya never sees it').last()).toBeVisible();

  await agent.getByRole('tab', { name: /Reply to Divya/ }).click();
  await agent.locator('.ProseMirror').click();
  await agent.keyboard.type('Hi Divya, I have added you to the intranet group. Please try again.');
  await agent.getByRole('button', { name: 'Send reply' }).click();
  await expect(agent.getByText('I have added you to the intranet group')).toBeVisible();

  // 3. Resolve.
  await agent.getByRole('button', { name: 'Resolve' }).click();
  await expect(agent.getByRole('combobox', { name: 'Status', exact: true })).toContainText('Resolved');

  // 4. Divya sees the reply and the new status, never the note.
  await employee.goto('/yx/desk/help');
  await employee.getByRole('radio', { name: 'All' }).click();
  await employee.getByRole('button', { name: subject }).click();
  await expect(employee.getByText('I have added you to the intranet group')).toBeVisible();
  await expect(employee.getByText('Resolved').first()).toBeVisible();
  await expect(employee.getByText(/proxy logs/)).toHaveCount(0);
});
