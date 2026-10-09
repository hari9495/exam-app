import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { basename, join } from 'path';
import { signWebhook } from '../src/service-desk/mail-adapters';
import { DEV_MAILBOXES } from '../prisma/seed-service-desk-channels';
import { dkimSign } from 'mailauth';

// LAPTOP ONLY. Sends one email to a seeded desk mailbox through the hosted-mail webhook, exactly as a mail provider
// would (raw MIME, signed with the mailbox's dev secret). Usage, from apps/api:
//   npx ts-node scripts/desk-mail-in.ts --to care --from someone@new-customer.test --subject "Damaged pack" --text "Two packs were torn."
//   npx ts-node scripts/desk-mail-in.ts --to care --from ravi@annapurna-stores.test --subject "Re: [CARE-502] ..." --in-reply-to "<sd.<message id>@kaverifoods.test>"
// Options: --to it|care, --from, --name, --subject, --text, --cc, --in-reply-to, --file <path>, --ip (sending server,
// default 198.51.100.20), --api (default http://localhost:3401), --dkim <private key PEM file> --selector <name> (signs
// the mail for its From domain; the API proves it only when it runs with SD_MAIL_DEV_DNS holding the public key). Mail from .test domains has no SPF / DKIM / DMARC, so the
// desk treats the sender as not proven: a known person's address is held for a desk admin, a new outside address makes
// a ticket marked "Sender not verified".

const arg = (k: string, d = '') => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? (process.argv[i + 1] ?? d) : d;
};

async function main() {
  // apps/api/.env (variables already set win, e.g. REDIS_URL for the e2e servers).
  process.loadEnvFile?.(join(__dirname, '../.env'));
  const box = DEV_MAILBOXES[(arg('to', 'care') as 'it' | 'care')] ?? DEV_MAILBOXES.care;
  const from = arg('from', 'new.customer@example-shop.test');
  const name = arg('name', from.split('@')[0]);
  const subject = arg('subject', 'Question about my order');
  const text = arg('text', 'Hello, my order has not arrived yet. Can you check?');
  const cc = arg('cc');
  const inReplyTo = arg('in-reply-to');
  const file = arg('file');
  const ip = arg('ip', '198.51.100.20');
  const api = arg('api', 'http://localhost:3401').replace(/\/$/, '');
  const boundary = `b-${randomUUID()}`;
  const head = [
    `From: "${name.replace(/"/g, '')}" <${from}>`,
    `To: ${box.address}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${subject}`,
    `Message-ID: <${randomUUID()}@${from.split('@')[1]}>`,
    `Date: ${new Date().toUTCString()}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    'MIME-Version: 1.0',
  ];
  const body = file
    ? [
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        'Content-Type: text/plain; charset=utf-8',
        '',
        text,
        `--${boundary}`,
        `Content-Type: application/octet-stream; name="${basename(file)}"`,
        `Content-Disposition: attachment; filename="${basename(file)}"`,
        'Content-Transfer-Encoding: base64',
        '',
        readFileSync(file).toString('base64').replace(/.{76}/g, '$&\r\n'),
        `--${boundary}--`,
      ]
    : ['Content-Type: text/plain; charset=utf-8', '', text];
  let raw = Buffer.from([...head, ...body].join('\r\n') + '\r\n', 'utf8');
  if (arg('dkim')) {
    const signed = await dkimSign(raw, { signatureData: [{ signingDomain: from.split('@')[1], selector: arg('selector', 'dev'), privateKey: readFileSync(arg('dkim'), 'utf8') }] } as never);
    raw = Buffer.concat([Buffer.from(signed.signatures), raw]);
  }

  const prisma = new PrismaClient();
  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'demo-org' }, select: { id: true } });
  await prisma.$disconnect();
  const env = { ip, helo: `mail.${from.split('@')[1]}`, mailFrom: from, rcptTo: box.address };
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${api}/api/v1/desk/inbound/email/${org.id}/${box.token}`, {
    method: 'POST',
    headers: {
      'content-type': 'message/rfc822',
      'x-yukthix-timestamp': ts,
      'x-yukthix-signature': signWebhook(box.secret, ts, env, raw),
      'x-envelope-ip': env.ip,
      'x-envelope-helo': env.helo,
      'x-envelope-from': env.mailFrom,
      'x-envelope-to': env.rcptTo,
    },
    body: raw,
  });
  console.log(`${res.status} ${await res.text()}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
