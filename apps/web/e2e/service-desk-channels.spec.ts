import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { signIn } from './fixtures/sign-in';

// M14 Service Desk, phase 3b-1 batch 3 on the seeded Kaveri Foods demo:
//   1. an outside customer (Asha Menon, Annapurna Stores) signs in to the Customer Care portal with a one-time code,
//      raises a ticket; the Customer Care agent replies; Asha sees the reply;
//   2. email in through the hosted webhook: a DKIM-signed mail from a known customer becomes a ticket on her account;
//      an unproven mail from a stranger becomes a ticket marked "not proven".
//
// Needs its own API and web against the seeded database (locally: API on 3411 with REDIS_URL=…/11 and
// SD_MAIL_DEV_DNS=<E2E_DEV_DNS>, web on 3410 with NEXT_PUBLIC_API_BASE=http://localhost:3411/api/v1,
// WEB_BASE_URL=http://localhost:3410). The laptop SMTP delivers nothing, so the sign-in code comes from
// apps/api/scripts/desk-portal-code.ts and the email from apps/api/scripts/desk-mail-in.ts.

const PASSWORD = 'Passw0rd!2026';
const API_DIR = resolve(__dirname, '../../api');
const API = process.env.E2E_API_ORIGIN ?? 'http://localhost:3411';
const DNS_FILE = process.env.E2E_DEV_DNS ?? join(tmpdir(), 'yx-desk-e2e-dns.json');
const run = randomUUID().slice(0, 6);

/** apps/api/.env plus the e2e Redis, for the two laptop scripts. */
function apiEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of readFileSync(join(API_DIR, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  env.REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/11';
  return env;
}
const script = (name: string, args: string[]) =>
  execFileSync(process.execPath, [join(API_DIR, '../../node_modules/ts-node/dist/bin.js'), '--transpile-only', `scripts/${name}`, ...args], { cwd: API_DIR, env: apiEnv(), encoding: 'utf8' });

async function portalSignIn(page: Page, email: string) {
  // A rerun within a minute would meet the 60-second wait between codes (P12); the laptop script lifts it.
  script('desk-portal-code.ts', [email, '--clear-wait']);
  await page.goto('/yx/portal/demo-org/care');
  await page.getByLabel(/Your email/).first().fill(email);
  await page.getByRole('button', { name: 'Send me a code' }).click();
  await expect(page.getByLabel(/6-digit code/)).toBeVisible();
  // The script replaces the code just sent (same key, same rules) and prints it.
  const code = /: (\d{6}) /.exec(script('desk-portal-code.ts', [email]))![1];
  await page.getByLabel(/6-digit code/).fill(code);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
}

async function openTicket(agent: Page, text: string) {
  await agent.goto('/yx/desk/tickets');
  await agent.getByRole('button', { name: /View:/ }).click();
  await agent.getByRole('menuitemradio', { name: 'All open' }).or(agent.getByRole('menuitem', { name: 'All open' })).click();
  await agent.getByRole('textbox', { name: /Search/ }).fill(text);
  await agent.getByText(text).first().click();
}

test('outside customer: portal sign-in → raise → agent replies → customer sees the reply', async ({ browser }) => {
  test.setTimeout(240_000);
  const subject = `Packets torn in delivery ${run}`;

  const customer = await (await browser.newContext()).newPage();
  await portalSignIn(customer, 'asha@annapurna-stores.test');
  await expect(customer.getByText('Annapurna Stores').first()).toBeVisible();
  await customer.getByRole('button', { name: 'Raise a ticket' }).click();
  const team = customer.getByRole('combobox', { name: /Team/ });
  // The team list shows only when the portal serves more than one desk.
  if ((await team.count()) && !(await team.textContent())?.includes('Customer Care')) {
    await team.click();
    await customer.getByRole('option', { name: /Customer Care/ }).click();
  }
  await customer.getByRole('textbox', { name: /Subject/ }).fill(subject);
  await customer.getByRole('textbox', { name: /Details/ }).fill('Three packets of rava idli mix came torn. Order 6630.');
  await customer.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(customer.getByText(/Ticket CARE-\d+ is open/)).toBeVisible();
  await expect(customer.getByRole('button', { name: subject })).toBeVisible();

  const agent = await (await browser.newContext()).newPage();
  await signIn(agent, 'it-agent@demo-org.test', PASSWORD);
  await agent.waitForURL((url) => !url.pathname.includes('sign-in'));
  await openTicket(agent, subject);
  await expect(agent.getByRole('heading', { name: subject })).toBeVisible();
  await expect(agent.getByText('Annapurna Stores').first()).toBeVisible();
  await agent.getByRole('tab', { name: /Reply to/ }).click();
  await agent.locator('.ProseMirror').click();
  await agent.keyboard.type('Hello Asha, new packets leave our warehouse today.');
  await agent.getByRole('button', { name: 'Send reply' }).click();
  await expect(agent.getByText('new packets leave our warehouse today')).toBeVisible();

  await customer.reload();
  await customer.getByRole('button', { name: subject }).click();
  await expect(customer.getByText('new packets leave our warehouse today')).toBeVisible();
  await customer.getByRole('textbox', { name: /Your reply/ }).fill('Thank you!');
  await customer.getByRole('button', { name: 'Send reply' }).click();
  await expect(customer.getByText('Thank you!')).toBeVisible();
});

test('email in through the hosted webhook: a signed customer mail lands on her account; a stranger is marked not proven', async ({ browser }) => {
  test.setTimeout(240_000);
  // The customer's domain signs its mail (DKIM) and asks receivers to reject failures (DMARC): published in the
  // laptop DNS file the e2e API reads.
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const keyFile = join(tmpdir(), `yx-desk-e2e-${run}.pem`);
  writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  writeFileSync(
    DNS_FILE,
    JSON.stringify({
      'TXT:e2e._domainkey.annapurna-stores.test': [`v=DKIM1; k=rsa; p=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`],
      'TXT:_dmarc.annapurna-stores.test': ['v=DMARC1; p=reject'],
    }),
  );
  const signed = `Rava idli mix order ${run}`;
  const stranger = `Where is my refund ${run}`;
  expect(script('desk-mail-in.ts', ['--api', API, '--to', 'care', '--from', 'ravi@annapurna-stores.test', '--name', 'Ravi Kumar', '--subject', signed, '--text', 'Please send 20 more packs. Order number: 8812', '--dkim', keyFile, '--selector', 'e2e'])).toContain('202 {');
  expect(script('desk-mail-in.ts', ['--api', API, '--to', 'care', '--from', `refunds-${run}@new-shop.test`, '--name', 'New Shop', '--subject', stranger, '--text', 'I paid twice.'])).toContain('202 {');

  const agent = await (await browser.newContext()).newPage();
  await signIn(agent, 'it-agent@demo-org.test', PASSWORD);
  await agent.waitForURL((url) => !url.pathname.includes('sign-in'));
  await expect(async () => {
    await openTicket(agent, signed);
    await expect(agent.getByRole('heading', { name: signed })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await expect(agent.getByText('Annapurna Stores').first()).toBeVisible();
  await expect(agent.getByText('Please send 20 more packs')).toBeVisible();
  await expect(agent.getByText(/could not prove who sent this email/i)).toHaveCount(0);

  await expect(async () => {
    await openTicket(agent, stranger);
    await expect(agent.getByRole('heading', { name: stranger })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 60_000 });
  await expect(agent.getByText(/could not prove who sent this email/i)).toBeVisible();
});
