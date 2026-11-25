import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { signIn } from './fixtures/sign-in';
import { dueWithinAnHour } from './fixtures/desk-db';
import { writeInEditor } from './fixtures/editor';

// M14 Service Desk, phase 3b-1 batches 1 and 2. Main flow on the seeded Kaveri Foods demo: an employee raises a ticket in the
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
  const raise = employee.getByRole('dialog', { name: 'Raise a ticket' });
  // The page hydrates after it paints: press again until the dialog opens.
  await expect(async () => {
    await employee.getByRole('button', { name: 'Raise a ticket' }).click();
    await expect(raise).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  // HLP-01 (a119f526e): the topic carries its team, so there is no separate team choice.
  await raise.getByRole('combobox', { name: /What is it about/ }).click();
  await employee.getByRole('option', { name: /^Access and accounts\s*IT help desk/ }).click();
  await raise.getByRole('textbox', { name: /Subject/ }).fill(subject);
  await raise.getByRole('textbox', { name: /Details/ }).fill('The intranet says access denied since this morning.');
  // HLP-01 asks no urgency (a119f526e): the team sets the priority.
  await raise.getByRole('button', { name: 'Raise ticket' }).click();
  // The toast says it (its screen-reader announcement carries the same words, so take the visible one, the last).
  const said = employee.getByText(/Your ticket number is IT-\d+/).last();
  await expect(said).toBeVisible();
  const number = (await said.textContent())!.match(/IT-\d+/)![0];
  const mine = employee.getByRole('list', { name: 'My tickets' });
  await expect(mine.getByRole('link', { name: subject })).toBeVisible();
  await expect(mine.getByRole('listitem').filter({ hasText: subject })).toContainText(number);

  // 2. Suresh (IT agent) finds it, takes it, adds a note and replies.
  const agent = await (await browser.newContext()).newPage();
  await signIn(agent, 'it-agent@demo-org.test', PASSWORD);
  // Agents land on Home (design audit step 1); the queue is one click away.
  await agent.waitForURL(/\/yx\/home/);
  await agent.goto('/yx/desk/tickets');
  await agent.getByRole('button', { name: /View:/ }).click();
  await agent.getByRole('menuitemradio', { name: 'All open' }).or(agent.getByRole('menuitem', { name: 'All open' })).click();
  await agent.getByRole('textbox', { name: /Search/ }).fill(number);
  // HLP-02: a row opens the quick view; "Open ticket" goes to the ticket.
  await agent.getByText(subject).click();
  await agent.getByRole('dialog').getByRole('button', { name: 'Open ticket' }).click();
  await expect(agent.getByRole('heading', { name: subject })).toBeVisible();
  // Take it (unless the desk already gave it to him); the button can appear just after the ticket paints.
  const take = agent.getByRole('button', { name: 'Assign to me' });
  const assignee = agent.getByRole('combobox', { name: 'Assignee', exact: true });
  await expect(async () => {
    if (await take.isVisible()) await take.click();
    await expect(assignee).toContainText('Suresh Pillai (me)', { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  await agent.getByRole('tab', { name: 'Internal note' }).click();
  await writeInEditor(agent, 'Checked the proxy logs: her account is not in the intranet group.');
  await agent.getByRole('button', { name: 'Add note' }).click();
  await expect(agent.getByText('Internal note, not visible to Divya').last()).toBeVisible();
  // The note shows (from the refresh) before sending has finished; when it finishes the composer clears and its editor
  // is replaced. Typing the reply before then lost it, or met a button still busy with the note.
  await expect(agent.getByRole('button', { name: 'Add note' })).not.toHaveAttribute('aria-busy', 'true', { timeout: 30_000 });
  await expect(agent.locator('.ProseMirror')).toHaveText('');

  await agent.getByRole('tab', { name: /Reply to Divya/ }).click();
  await writeInEditor(agent, 'Hi Divya, I have added you to the intranet group. Please try again.');
  await agent.getByRole('button', { name: 'Send reply' }).click();
  await expect(agent.getByText('I have added you to the intranet group')).toBeVisible();

  // 3. Resolve (batch 2: a dialog asks how it was solved; the IT desk does not require a code).
  await agent.getByRole('button', { name: 'Resolve' }).click();
  await agent.getByRole('dialog').getByRole('button', { name: 'Resolve' }).click();
  await expect(agent.getByRole('combobox', { name: 'Status', exact: true })).toContainText('Resolved');

  // 4. Divya sees the reply and the new status, never the note.
  await employee.goto('/yx/desk/help');
  const item = employee.getByRole('list', { name: 'My tickets' }).getByRole('listitem').filter({ hasText: subject });
  await expect(item).toContainText('Resolved', { timeout: 30_000 });
  await item.getByRole('link', { name: subject }).click();
  await expect(employee.getByRole('list', { name: 'Conversation' })).toContainText('I have added you to the intranet group', { timeout: 30_000 });
  await expect(employee.getByText(/^Not fixed\? Reply by /)).toBeVisible();
  await expect(employee.getByText(/proxy logs/)).toHaveCount(0);
});

// Batch 2 (SD-1.14 … SD-1.16): the seeded ticket close to its resolution target shows in "Breaching soon", and its
// workspace draws the response-target timeline with the time used and when it is due (or that it was missed).
test('SLA: a ticket near its breach is listed and its timeline shows', async ({ browser }) => {
  test.setTimeout(120_000);
  // Outside office hours its 48 business minutes reach past 4 hours: fix the clock-dependent part, keep the check.
  await dueWithinAnHour('Payroll export keeps timing out');
  const agent = await (await browser.newContext()).newPage();
  await signIn(agent, 'it-agent@demo-org.test', PASSWORD);
  // Agents land on Home (design audit step 1); the queue is one click away.
  await agent.waitForURL(/\/yx\/home/);
  await agent.goto('/yx/desk/tickets');
  await agent.getByRole('button', { name: /View:/ }).click();
  await agent.getByRole('menuitemradio', { name: 'At risk or breached' }).or(agent.getByRole('menuitem', { name: 'At risk or breached' })).click();
  await agent.getByText('Payroll export keeps timing out').first().click();
  await agent.getByRole('dialog').getByRole('button', { name: 'Open ticket' }).click();
  await expect(agent.getByRole('heading', { name: 'Payroll export keeps timing out' })).toBeVisible();
  await expect(agent.getByRole('heading', { name: 'Response targets' })).toBeVisible();
  await expect(agent.getByRole('list', { name: 'Resolution timeline' })).toBeVisible();
  await expect(agent.getByText(/Due .*|missed at/).first()).toBeVisible();
  await expect(agent.getByRole('meter', { name: /Resolution time used/ }).or(agent.getByText(/% of 8 h/)).first()).toBeVisible();
  // The open task blocks resolving until it is done (US-G-006).
  await expect(agent.getByText('Check the export server logs')).toBeVisible();
});
