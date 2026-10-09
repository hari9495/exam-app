import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { signIn } from './fixtures/sign-in';

// M14 Service Desk, phase 3b-2 batch 3 (SD-2.21, and the founder decision of 9 Oct 2026 on signing) on the seeded Kaveri
// Foods demo:
//   1. Arjun writes to the IT desk on WhatsApp (his phone is linked; the demo phone sends through the same signed webhook
//      path a provider uses) → a request is made and the acknowledgement reaches his phone → Farah (IT lead) replies on
//      the ticket → the reply reaches his phone on WhatsApp.
//   2. Farah sends Arjun the "Laptop hand-over" document on that request; Arjun signs it, and signing asks for a one-time
//      code first.
//
// Needs the API (DESK_CHANNELS=dev-fake, APPROVAL_CHANNELS=dev-fake) and web against the seeded database (locally: API on
// 3701, web on 3700 with NEXT_PUBLIC_API_BASE=http://localhost:3701/api/v1, WEB_BASE_URL=http://localhost:3700). The
// laptop SMTP delivers nothing, so the signing code comes from apps/api/scripts/desk-sign-code.ts.

const PASSWORD = 'Passw0rd!2026';
const API_DIR = resolve(__dirname, '../../api');
const run = randomUUID().slice(0, 6);

function apiEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of readFileSync(join(API_DIR, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  if (process.env.E2E_REDIS_URL) env.REDIS_URL = process.env.E2E_REDIS_URL;
  return env;
}
const script = (name: string, args: string[]) => execFileSync(process.execPath, [join(API_DIR, '../../node_modules/ts-node/dist/bin.js'), '--transpile-only', `scripts/${name}`, ...args], { cwd: API_DIR, env: apiEnv(), encoding: 'utf8' });

async function openTicket(agent: Page, text: string) {
  await agent.goto('/yx/desk/tickets');
  await agent.getByRole('button', { name: /View:/ }).click();
  await agent.getByRole('menuitemradio', { name: 'All open' }).or(agent.getByRole('menuitem', { name: 'All open' })).click();
  await agent.getByRole('textbox', { name: /Search/ }).fill(text);
  await agent.getByText(text).first().click();
}

test('an employee writes on WhatsApp → a request → the agent replies → the reply reaches the phone; signing asks for a code', async ({ browser }) => {
  test.setTimeout(300_000);
  const words = `My docking station is dead ${run}`;

  // 1. Arjun's phone (the demo phone sends from his linked number).
  const arjun = await (await browser.newContext()).newPage();
  await signIn(arjun, 'arjun@demo-org.test', PASSWORD);
  await arjun.waitForURL((url) => !url.pathname.includes('sign-in'));
  await arjun.goto('/yx/desk/help');
  const phone = arjun.getByRole('region', { name: 'Get help on WhatsApp, SMS or chat' });
  await expect(phone.getByText(/Linked \+91/).first()).toBeVisible();
  await phone.getByRole('radio', { name: 'WhatsApp' }).click();
  await phone.getByRole('textbox', { name: 'Message' }).fill(words);
  await phone.getByRole('button', { name: 'Send from my phone' }).click();
  const outbox = phone.getByRole('list', { name: 'Messages to my phone' });
  const ack = outbox.getByText(/Thank you\. We made request IT-\d+\. We will reply here\./).first();
  await expect(ack).toBeVisible({ timeout: 30_000 });
  const number = /IT-\d+/.exec((await ack.textContent())!)![0];

  // 2. Farah finds it (made from WhatsApp) and replies on the ticket.
  const farah = await (await browser.newContext()).newPage();
  await signIn(farah, 'it-lead@demo-org.test', PASSWORD);
  await farah.waitForURL((url) => !url.pathname.includes('sign-in'));
  await openTicket(farah, words);
  await expect(farah.getByRole('heading', { name: words })).toBeVisible();
  const ticketId = /\/yx\/desk\/tickets\/([0-9a-f-]{36})/.exec(farah.url())![1];
  await farah.getByRole('tab', { name: /Reply to/ }).click();
  await farah.locator('.ProseMirror').click();
  await farah.keyboard.type('Please try another USB-C port; I am sending a new dock.');
  await farah.getByRole('button', { name: 'Send reply' }).click();
  await expect(farah.getByText('I am sending a new dock').first()).toBeVisible();

  // The reply reaches Arjun's WhatsApp (inside the 24-hour window: the words themselves).
  await expect(outbox.getByText(new RegExp(`Farah Khan replied on ${number}`)).first()).toBeVisible({ timeout: 30_000 });
  await expect(outbox.getByText(/I am sending a new dock/).first()).toBeVisible();

  // 3. Farah sends the hand-over document on the same request.
  await farah.getByRole('combobox', { name: 'Make a document' }).click();
  await farah.getByRole('option', { name: /Laptop hand-over/ }).click();
  await farah.getByRole('button', { name: 'Make and send' }).click();
  await expect(farah.getByText('Laptop hand-over').first()).toBeVisible();

  // 4. Arjun signs: name, confirmation, then a one-time code (founder decision 9 Oct 2026).
  await arjun.goto(`/yx/desk/help/${ticketId}`);
  await arjun.getByRole('button', { name: 'Read and sign' }).click();
  await arjun.getByRole('textbox', { name: /Type your full name/ }).fill('Arjun Kulkarni');
  await arjun.getByRole('checkbox', { name: /I have read this document/ }).click();
  await expect(arjun.getByRole('button', { name: 'Sign', exact: true })).toHaveCount(0);
  await arjun.getByRole('button', { name: 'Send me a code' }).click();
  await expect(arjun.getByText(/We sent a 6-digit code to/)).toBeVisible();
  await expect(arjun.getByRole('button', { name: 'Sign', exact: true })).toBeDisabled();
  const code = /: (\d{6}) /.exec(script('desk-sign-code.ts', ['arjun@demo-org.test']))![1];
  await arjun.getByRole('textbox', { name: /6-digit code/ }).fill(code);
  await arjun.getByRole('button', { name: 'Sign', exact: true }).click();
  await expect(arjun.getByText('Signed').first()).toBeVisible();
});
