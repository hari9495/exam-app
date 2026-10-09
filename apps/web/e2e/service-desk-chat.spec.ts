import { expect, test } from '@playwright/test';
import { signIn } from './fixtures/sign-in';

// M14 Service Desk, phase 3b-2 batch 2 (SD-2.06, SD-2.18, SD-2.19) on the seeded Kaveri Foods demo:
//   1. Arjun starts a live chat with IT; Farah (IT lead) takes it from her live queue, they write to each other over the
//      socket, and Farah turns it into a ticket with the transcript, which Arjun can then follow.
//   2. Arjun orders "Access to a shared folder" (his manager approves); Divya, who linked Teams, opens
//      the card's single-use link and approves there; the link cannot be used again.
//
// Needs the API (with APPROVAL_CHANNELS=dev-fake) and web against the seeded database (locally: API on 3411, web on 3410
// with NEXT_PUBLIC_API_BASE=http://localhost:3411/api/v1, WEB_BASE_URL=http://localhost:3410).

const PASSWORD = 'Passw0rd!2026';

test('employee starts a chat → agent takes it → they chat → the chat becomes a ticket', async ({ browser }) => {
  test.setTimeout(180_000);
  const farah = await (await browser.newContext()).newPage();
  await signIn(farah, 'it-lead@demo-org.test', PASSWORD);
  await farah.waitForURL((url) => !url.pathname.includes('sign-in'));
  await farah.goto('/yx/desk/live-chat');
  await farah.getByRole('combobox', { name: 'Desk' }).click();
  await farah.getByRole('option', { name: 'IT help desk' }).click();
  await expect(farah.getByText('Live: new chats appear here.')).toBeVisible();

  const arjun = await (await browser.newContext()).newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/desk/chat');
  await arjun.getByRole('combobox', { name: /Who do you want to chat with/ }).click();
  await arjun.getByRole('option', { name: /IT chat/ }).click();
  const subject = `Outlook will not open ${Math.random().toString(36).slice(2, 8)}`;
  await arjun.getByRole('textbox', { name: /What is it about\?/ }).first().fill(subject);
  await arjun.getByRole('combobox', { name: /What is it about\?/ }).click();
  await arjun.getByRole('option', { name: 'My laptop' }).click();
  await arjun.getByRole('button', { name: 'Start chat' }).click();
  await expect(arjun.getByText('Waiting for someone').first()).toBeVisible();

  // The new chat reaches Farah's queue live; she takes it.
  await farah.getByRole('button', { name: new RegExp(subject) }).click();
  await farah.getByRole('button', { name: 'Take this chat' }).click();
  await expect(arjun.getByText(/Farah Khan joined the chat/)).toBeVisible();

  await arjun.getByRole('textbox', { name: 'Message' }).fill('Outlook crashes at start since this morning.');
  await arjun.getByRole('button', { name: 'Send' }).click();
  await expect(farah.getByText('Outlook crashes at start since this morning.')).toBeVisible();
  await farah.getByRole('textbox', { name: 'Message' }).fill('Thanks. I will look into it on a ticket.');
  await farah.getByRole('button', { name: 'Send' }).click();
  await expect(arjun.getByText('Thanks. I will look into it on a ticket.')).toBeVisible();

  // Not solved in the chat: it becomes a ticket with the transcript, owned by Farah.
  await farah.getByRole('button', { name: 'Make a ticket' }).click();
  const open = farah.getByRole('button', { name: /^Open IT-\d+$/ });
  await expect(open).toBeVisible();
  const number = (await open.textContent())!.replace('Open ', '');
  await expect(arjun.getByText(`Ticket ${number}`, { exact: true })).toBeVisible();
  await open.click();
  await expect(farah.getByText('Outlook crashes at start since this morning.').first()).toBeVisible();
});

test('a manager approves from the link in a Teams card; the link works once', async ({ browser }) => {
  test.setTimeout(180_000);
  const arjun = await (await browser.newContext()).newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/desk/catalog');
  await arjun.getByRole('button', { name: 'Open Access to a shared folder' }).click();
  const item = arjun.getByRole('dialog');
  await item.getByRole('textbox', { name: /Folder name or path/ }).fill(`Finance/Quarterly ${Date.now()}`);
  await item.getByRole('combobox', { name: /^Access/ }).click();
  await arjun.getByRole('option', { name: /Read only/ }).click();
  await item.getByRole('button', { name: 'Add to cart' }).click();
  await arjun.getByRole('button', { name: 'Send request' }).click();
  await expect(arjun.getByRole('button', { name: /Follow IT-\d+/ })).toBeVisible();

  // Divya linked Microsoft Teams: the card went there (the demo transport shows it on her Approvals page).
  const divya = await (await browser.newContext()).newPage();
  await signIn(divya, 'panel@demo-org.test', PASSWORD);
  await divya.waitForURL((url) => !url.pathname.includes('sign-in'));
  await divya.goto('/yx/approvals');
  const card = divya.getByRole('listitem').filter({ hasText: /Microsoft Teams: Access to a shared folder for Arjun Kulkarni/ }).first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  const href = await card.getByRole('link', { name: 'Open to decide' }).getAttribute('href');
  expect(href).toMatch(/\/yx\/act\//);
  const path = new URL(href!).pathname;

  // The link opens without signing in (a phone or a chat app) and decides only on the press.
  const phone = await (await browser.newContext()).newPage();
  await phone.goto(path);
  await expect(phone.getByText('This link works once')).toBeVisible();
  await phone.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(phone.getByText('You approved it.')).toBeVisible();
  await phone.goto(path);
  await expect(phone.getByText(/already used/)).toBeVisible();
});
