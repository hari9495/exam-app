import { generateKeyPairSync } from 'crypto';
import { dkimSign } from 'mailauth';
import { GmailPoller, GraphPoller, ImapPoller, signWebhook, verifyWebhook } from './mail-adapters';
import { AuthFacts, autoReplyReason, checkSender, readReplyToken, replyToken, senderVerdict, withToken } from './mail-auth';
import { REPLY_MARKER, parseEmail, visibleReply } from './mail-parse';
import { readCommands, readField, runRules } from './mail-rules';
import { HEALTH_MASK, maskPii, unmaskHealth } from './pii';

// SD-1.19 / SD-1.20 unit tests (§15.2 "Email"): the §14.3 sender table, real SPF / DKIM / DMARC checks against a fake
// DNS, loop headers, reply tokens, MIME fixtures (multipart, inline images, TNEF, wrong charsets, huge headers,
// HTML-only with a tracking pixel, bounces, complaints), quoted history, rules, commands and the four adapters.

const facts = (f: Partial<AuthFacts>): AuthFacts => ({ fromDomain: 'cust.example', spf: 'none', dkim: 'none', dkimAligned: false, spfAligned: false, dmarc: 'none', dmarcPolicy: null, arc: 'none', arcSealer: null, arcDmarc: null, ...f });
const opts = { ownDomains: ['kaverifoods.test'], trustedForwarders: ['forwarder.example'] };

describe('who sent it (§14.3)', () => {
  it('DMARC pass is verified; a DKIM signature of the From domain also makes it signed', () => {
    expect(senderVerdict(facts({ dmarc: 'pass', dkim: 'pass', dkimAligned: true }), opts)).toEqual({ action: 'accept', verified: true, signed: true, reason: null });
    expect(senderVerdict(facts({ dmarc: 'pass', spf: 'pass', spfAligned: true }), opts)).toMatchObject({ action: 'accept', verified: true, signed: false });
  });

  it('DMARC fail with reject or quarantine is held; with p=none it comes in but not verified', () => {
    expect(senderVerdict(facts({ dmarc: 'fail', dmarcPolicy: 'reject' }), opts)).toMatchObject({ action: 'hold', verified: false });
    expect(senderVerdict(facts({ dmarc: 'fail', dmarcPolicy: 'quarantine' }), opts)).toMatchObject({ action: 'hold', verified: false });
    expect(senderVerdict(facts({ dmarc: 'fail', dmarcPolicy: 'none' }), opts)).toMatchObject({ action: 'accept', verified: false });
  });

  it('no DMARC: SPF or DKIM of the From domain verifies; both failing does not', () => {
    expect(senderVerdict(facts({ spf: 'pass', spfAligned: true }), opts)).toMatchObject({ action: 'accept', verified: true });
    expect(senderVerdict(facts({ dkim: 'pass', dkimAligned: true }), opts)).toMatchObject({ action: 'accept', verified: true, signed: true });
    // An SPF pass for some other domain (the bounce address) proves nothing about the From address.
    expect(senderVerdict(facts({ spf: 'pass', spfAligned: false }), opts)).toMatchObject({ action: 'accept', verified: false });
    expect(senderVerdict(facts({ spf: 'fail', dkim: 'fail' }), opts)).toMatchObject({ action: 'accept', verified: false });
  });

  it('mail claiming our own domain without our signature is rejected; a DNS error holds it', () => {
    expect(senderVerdict(facts({ fromDomain: 'kaverifoods.test', dmarc: 'pass', spf: 'pass', spfAligned: true }), opts)).toMatchObject({ action: 'reject' });
    expect(senderVerdict(facts({ fromDomain: 'kaverifoods.test', dmarc: 'pass', dkimAligned: true }), opts)).toMatchObject({ action: 'accept', verified: true });
    expect(senderVerdict(facts({ dmarc: 'temperror' }), opts)).toMatchObject({ action: 'hold' });
  });

  it('ARC is used only for forwarders the company listed', () => {
    const forwarded = facts({ dmarc: 'fail', dmarcPolicy: 'reject', arc: 'pass', arcDmarc: 'pass' });
    expect(senderVerdict({ ...forwarded, arcSealer: 'forwarder.example' }, opts)).toMatchObject({ action: 'accept', verified: true });
    expect(senderVerdict({ ...forwarded, arcSealer: 'evil.example' }, opts)).toMatchObject({ action: 'hold' });
  });
});

describe('real checks with mailauth over a fake DNS', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const zone: Record<string, string[]> = {
    'TXT:sel._domainkey.cust.example': [`v=DKIM1; k=rsa; p=${publicKey.export({ type: 'spki', format: 'der' }).toString('base64')}`],
    'TXT:_dmarc.cust.example': ['v=DMARC1; p=reject'],
    'TXT:cust.example': ['v=spf1 ip4:203.0.113.5 -all'],
  };
  const resolver = async (name: string, type: string) => {
    const r = zone[`${type}:${name.toLowerCase()}`];
    if (!r) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return r.map((x) => [x]);
  };
  const msg = 'From: Asha Rao <asha@cust.example>\r\nTo: care@kaverifoods.test\r\nSubject: Order 1182 is late\r\nMessage-ID: <a1@cust.example>\r\nDate: Thu, 08 Oct 2026 10:00:00 +0000\r\n\r\nMy order has not arrived.\r\n';

  it('a signed email from anywhere passes DMARC (verified and signed)', async () => {
    // mailauth 5 takes signatureData at run time (its bundled types describe the newer single-signature form).
    const signed = await dkimSign(msg, { signatureData: [{ signingDomain: 'cust.example', selector: 'sel', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }] } as never);
    const f = await checkSender(Buffer.from(signed.signatures + msg), { ip: '198.51.100.9', mailFrom: 'asha@cust.example' }, 'asha@cust.example', resolver);
    expect(f).toMatchObject({ dkim: 'pass', dkimAligned: true, dmarc: 'pass' });
    expect(senderVerdict(f, opts)).toMatchObject({ verified: true, signed: true });
  });

  it('a spoofed copy from a stranger IP fails DMARC p=reject and is held', async () => {
    const f = await checkSender(Buffer.from(msg), { ip: '198.51.100.9', mailFrom: 'asha@cust.example' }, 'asha@cust.example', resolver);
    expect(f).toMatchObject({ spf: 'fail', dmarc: 'fail', dmarcPolicy: 'reject' });
    expect(senderVerdict(f, opts).action).toBe('hold');
  });

  it("the domain's own server passes SPF and DMARC without a signature (verified, not signed)", async () => {
    const f = await checkSender(Buffer.from(msg), { ip: '203.0.113.5', mailFrom: 'asha@cust.example' }, 'asha@cust.example', resolver);
    expect(senderVerdict(f, opts)).toMatchObject({ verified: true, signed: false });
  });
});

describe('loops and automatic mail (§9.1 step 3)', () => {
  const h = (o: Record<string, string>) => new Map(Object.entries(o));
  it('auto-submitted, bulk, lists, auto replies and robot senders are automatic', () => {
    expect(autoReplyReason(h({ 'auto-submitted': 'auto-replied' }), 'a@x.com')).toMatch(/Auto-Submitted/);
    expect(autoReplyReason(h({ 'auto-submitted': 'no' }), 'a@x.com')).toBeNull();
    expect(autoReplyReason(h({ precedence: 'bulk' }), 'a@x.com')).toMatch(/Precedence/);
    expect(autoReplyReason(h({ 'list-id': '<x.list>' }), 'a@x.com')).toMatch(/list-id/);
    expect(autoReplyReason(h({ 'x-autoreply': 'yes' }), 'a@x.com')).toMatch(/x-autoreply/);
    expect(autoReplyReason(h({}), 'MAILER-DAEMON@x.com')).toMatch(/automatic address/);
    expect(autoReplyReason(h({ 'x-auto-response-suppress': 'OOF' }), 'a@x.com')).toBeNull();
    expect(autoReplyReason(h({}), 'asha@cust.example')).toBeNull();
  });
});

describe('reply tokens (§9.1 step 6a)', () => {
  const secret = 'k'.repeat(64);
  it('round-trips, survives lower-casing and refuses a changed number, company or mac', () => {
    const addr = withToken('care@kaverifoods.test', replyToken(secret, 'org-1', 'CS-1042'));
    expect(addr).toMatch(/^care\+t\.cs-1042\.[0-9a-f]{12}@kaverifoods\.test$/);
    expect(readReplyToken(secret, 'org-1', ['someone@else.test', addr.toUpperCase()])).toBe('CS-1042');
    expect(readReplyToken(secret, 'org-2', [addr])).toBeNull();
    expect(readReplyToken(secret, 'org-1', [addr.replace('cs-1042', 'cs-1043')])).toBeNull();
    expect(readReplyToken('other', 'org-1', [addr])).toBeNull();
  });
});

const mime = (headers: string, body: string) => Buffer.from(`${headers.trim().replace(/\n/g, '\r\n')}\r\n\r\n${body.replace(/\n/g, '\r\n')}`, 'latin1');

describe('parsing (§9.1 steps 4-7)', () => {
  it('multipart with an inline image and an attachment: text kept, files listed, inline marked', async () => {
    const p = await parseEmail(
      mime(
        `From: "Asha Rao" <ASHA@cust.example>
To: care@kaverifoods.test
Cc: Ravi <ravi@cust.example>
Subject: Screenshot attached
Message-ID: <m1@cust.example>
In-Reply-To: <sd.abc@kaverifoods.test>
References: <x1@cust.example> <sd.abc@kaverifoods.test>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b1"`,
        `--b1
Content-Type: multipart/related; boundary="b2"

--b2
Content-Type: text/html; charset=utf-8

<p>See the picture <img src="cid:pic1"> and <img src="https://track.example/p.gif" width="1" height="1"></p>
--b2
Content-Type: image/png
Content-ID: <pic1>
Content-Disposition: inline; filename="shot.png"
Content-Transfer-Encoding: base64

iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==
--b2--
--b1
Content-Type: application/pdf; name="invoice.pdf"
Content-Disposition: attachment; filename="invoice.pdf"
Content-Transfer-Encoding: base64

JVBERi0xLjQKJSVFT0YK
--b1--`,
      ),
    );
    expect(p.from).toEqual({ address: 'asha@cust.example', name: 'Asha Rao' });
    expect(p.cc).toEqual(['ravi@cust.example']);
    expect(p.inReplyTo).toBe('<sd.abc@kaverifoods.test>');
    expect(p.references).toEqual(['<x1@cust.example>', '<sd.abc@kaverifoods.test>']);
    // HTML-only mail goes through the allow-list: no image, no tracking pixel survives.
    expect(p.text).toContain('See the picture');
    expect(p.fullText).not.toMatch(/track\.example|<img/);
    expect(p.attachments.map((a) => [a.fileName, a.inline])).toEqual([
      ['shot.png', true],
      ['invoice.pdf', false],
    ]);
  });

  it('wrong charsets, encoded words, TNEF and huge headers do not break it', async () => {
    const big = 'X-Junk: ' + 'a'.repeat(50_000);
    const p = await parseEmail(
      mime(
        `From: =?iso-8859-1?Q?Jos=E9?= <jose@cust.example>
To: care@kaverifoods.test
Subject: =?utf-8?B?4LKV4LKo4LON4LKo4LKh?= order
Message-ID: <m2@cust.example>
${big}
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="b"`,
        `--b
Content-Type: text/plain; charset=x-unknown-charset

Caf\xe9 ol\xe9
--b
Content-Type: application/ms-tnef; name="winmail.dat"
Content-Disposition: attachment; filename="winmail.dat"
Content-Transfer-Encoding: base64

eJ8+IgAAAQaQCAAEAAAAAAABAAEAAQeQBgAIAAAA5AQAAAAAAADoAAEIgAcAGAAAAElQTS5NaWNy
--b--`,
      ),
    );
    expect(p.from?.name).toBe('José');
    expect(p.subject).toBe('ಕನ್ನಡ order');
    expect(p.text).toMatch(/Caf/);
    expect(p.headers.get('x-junk')!.length).toBeLessThanOrEqual(2000);
    expect(p.attachments[0]).toMatchObject({ fileName: 'winmail.dat', contentType: 'application/ms-tnef' });
  });

  it('quoted history and our reply marker are cut; the full text stays for "show original"', () => {
    const text = `Yes, it works now.\n\n${REPLY_MARKER}\nHi Asha, please restart.\n`;
    expect(visibleReply(text)).toBe('Yes, it works now.');
    expect(visibleReply('Thanks!\n\nOn Mon, 5 Oct 2026 at 10:00, Care <care@k.test> wrote:\n> old\n> older\n')).toBe('Thanks!');
  });

  it('a bounce report lists the failed address; a complaint its original recipient', async () => {
    const dsn = await parseEmail(
      mime(
        `From: Mail Delivery System <MAILER-DAEMON@mx.example>
To: care@kaverifoods.test
Subject: Undelivered
Message-ID: <b1@mx.example>
MIME-Version: 1.0
Content-Type: multipart/report; report-type=delivery-status; boundary="r"`,
        `--r
Content-Type: text/plain

Could not deliver.
--r
Content-Type: message/delivery-status

Reporting-MTA: dns; mx.example

Final-Recipient: rfc822; gone@cust.example
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550 5.1.1 user unknown
--r--`,
      ),
    );
    expect(dsn.report).toEqual({ kind: 'bounce', recipients: ['gone@cust.example'], detail: 'smtp; 550 5.1.1 user unknown' });
    const arf = await parseEmail(
      mime(
        `From: abuse@isp.example
To: care@kaverifoods.test
Subject: Complaint
Message-ID: <c1@isp.example>
MIME-Version: 1.0
Content-Type: multipart/report; report-type=feedback-report; boundary="f"`,
        `--f
Content-Type: text/plain

A complaint.
--f
Content-Type: message/feedback-report

Feedback-Type: abuse
Original-Rcpt-To: annoyed@cust.example
--f--`,
      ),
    );
    expect(arf.report).toEqual({ kind: 'complaint', recipients: ['annoyed@cust.example'], detail: 'abuse' });
  });
});

describe('email rules and commands (US-G-018, US-G-019)', () => {
  const mail = { from: 'billing@bigmart.example', to: ['care@kaverifoods.test'], subject: 'URGENT: invoice copy', body: 'Hello\nOrder number: 77881\nThanks', headers: new Map([['x-priority', '1']]) };
  const rule = (o: Partial<Parameters<typeof runRules>[0][number]>) => ({ id: 'r', name: 'r', field: 'subject', headerName: null, op: 'contains', value: 'x', action: 'tag', actionValue: {}, stop: false, ...o });

  it('matches plain text on each field and applies the actions in order', () => {
    const out = runRules(
      [
        rule({ name: 'Urgent', field: 'subject', op: 'starts_with', value: 'urgent', action: 'priority', actionValue: { priority: 1 } }),
        rule({ name: 'BigMart', field: 'domain', op: 'equals', value: 'bigmart.example', action: 'tag', actionValue: { tag: 'bigmart' } }),
        rule({ name: 'Order', field: 'body', op: 'contains', value: 'order number', action: 'parse_field', actionValue: { key: 'Order number', field: 'order_number' } }),
        rule({ name: 'Header', field: 'header', headerName: 'x-priority', op: 'equals', value: '1', action: 'tag', actionValue: { tag: 'flagged' } }),
        rule({ name: 'Never', field: 'from', op: 'ends_with', value: '@other.example', action: 'reject' }),
      ],
      mail,
    );
    expect(out).toMatchObject({ priority: 1, tags: ['bigmart', 'flagged'], fields: { order_number: '77881' }, reject: null, matched: ['Urgent', 'BigMart', 'Order', 'Header'] });
  });

  it('reject and spam stop the run; "stop" stops it too', () => {
    expect(runRules([rule({ name: 'Block', field: 'from', op: 'contains', value: 'billing@', action: 'reject' }), rule({ action: 'tag', actionValue: { tag: 'never' }, value: 'invoice' })], mail)).toMatchObject({ reject: 'Rule "Block"', tags: [] });
    expect(runRules([rule({ value: 'invoice', actionValue: { tag: 'a' }, stop: true }), rule({ value: 'invoice', actionValue: { tag: 'b' } })], mail).tags).toEqual(['a']);
  });

  it('reads "Key: value" lines and top-of-mail commands only', () => {
    expect(readField('Order number : 1 2 3\n', 'order number')).toBe('1 2 3');
    expect(readField('No colon here', 'order')).toBeNull();
    expect(readCommands('#status solved\n#priority 2\nFixed the printer.\n#tag nope')).toEqual({ commands: [{ name: 'status', arg: 'solved' }, { name: 'priority', arg: '2' }], rest: 'Fixed the printer.\n#tag nope' });
    expect(readCommands('Hello #close')).toEqual({ commands: [], rest: 'Hello #close' });
  });
});

describe('adapters (§9.1, D5): webhook signature and the three pollers with fakes', () => {
  const env = { ip: '203.0.113.5', helo: 'mx.cust.example', mailFrom: 'asha@cust.example', rcptTo: 'care@kaverifoods.test' };
  const raw = Buffer.from('From: a@b.c\r\n\r\nhi');

  it('the hosted webhook accepts only a fresh, exact signature', () => {
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = signWebhook('s3cret', ts, env, raw);
    expect(verifyWebhook('s3cret', ts, sig, env, raw)).toBe(true);
    expect(verifyWebhook('s3cret', ts, sig, { ...env, ip: '198.51.100.1' }, raw)).toBe(false);
    expect(verifyWebhook('s3cret', ts, sig, env, Buffer.from('From: a@b.c\r\n\r\nHI'))).toBe(false);
    expect(verifyWebhook('other', ts, sig, env, raw)).toBe(false);
    expect(verifyWebhook('s3cret', String(Number(ts) - 600), signWebhook('s3cret', String(Number(ts) - 600), env, raw), env, raw)).toBe(false);
    expect(verifyWebhook('s3cret', undefined, sig, env, raw)).toBe(false);
  });

  it('IMAP: new UIDs only, cursor per UIDVALIDITY, connects to the checked address', async () => {
    const seen: string[] = [];
    const fake = {
      connect: async () => undefined,
      logout: async () => undefined,
      mailboxOpen: async () => ({ uidValidity: 7 }),
      fetchAll: async (range: string) => {
        seen.push(range);
        return [{ uid: 5, source: raw }, { uid: 6, source: raw }].filter((m) => m.uid >= Number(range.split(':')[0]));
      },
    };
    let host = '';
    const p = new ImapPoller({ host: 'imap.cust.example', port: 993, secure: true, user: 'u', password: 'p' }, (c) => ((host = c.host), fake), async () => '203.0.113.7');
    expect(await p.poll(null)).toMatchObject({ messages: [{ id: '5' }, { id: '6' }], cursor: '7:6' });
    expect(host).toBe('203.0.113.7');
    expect(await p.poll('7:6')).toMatchObject({ messages: [], cursor: '7:6' });
    // A new UIDVALIDITY starts again.
    expect((await p.poll('3:900')).messages).toHaveLength(2);
    expect(seen).toEqual(['1:*', '7:*', '1:*']);
    // A private address is refused before any connection.
    await expect(new ImapPoller({ host: 'intranet', port: 993, secure: true, user: 'u', password: 'p' }, () => fake, async () => Promise.reject(new Error('does not resolve to a public address'))).poll(null)).rejects.toThrow(/public address/);
  });

  it('Graph: lists new messages after the cursor and fetches each as raw MIME', async () => {
    const paths: string[] = [];
    const fake = {
      getJson: async <T>(path: string) => {
        paths.push(path);
        return { value: [{ id: 'AAA', receivedDateTime: '2026-10-08T10:00:00Z' }] } as T;
      },
      getRaw: async (path: string) => {
        paths.push(path);
        return raw;
      },
    };
    const res = await new GraphPoller({ tenantId: 't', clientId: 'c', clientSecret: 's', user: 'care@kaverifoods.test' }, () => fake).poll('2026-10-08T09:00:00.000Z');
    expect(res).toMatchObject({ messages: [{ id: 'AAA', raw }], cursor: '2026-10-08T10:00:00Z' });
    expect(paths[0]).toContain('receivedDateTime gt 2026-10-08T09:00:00.000Z');
    expect(paths[1]).toBe('/users/care%40kaverifoods.test/messages/AAA/$value');
  });

  it('Gmail: raw base64url messages newer than the cursor, oldest first', async () => {
    const fake = { list: async () => [{ id: 'g2' }, { id: 'g1' }], raw: async (id: string) => ({ raw: Buffer.from(`mail ${id}`).toString('base64url'), internalDate: id === 'g1' ? '1000' : '2000' }) };
    const res = await new GmailPoller({ clientId: 'c', clientSecret: 's', refreshToken: 'r' }, () => fake).poll('1000');
    expect(res.messages.map((m) => m.raw.toString())).toEqual(['mail g2']);
    expect(res.cursor).toBe('2000');
  });
});

describe('health words on HR desks (founder decision 8 Oct 2026)', () => {
  it('only health words come back, in order; Aadhaar, PAN and passwords stay masked', () => {
    const m = maskPii('I have diabetes and my PAN is ABCPK1234Z; password: hunter22. Also depression.');
    const words = m.found.filter((f) => f.kind === 'health').map((f) => f.value);
    expect(words).toEqual(['diabetes', 'depression']);
    const back = unmaskHealth(m.text, words);
    expect(back).toContain('I have diabetes');
    expect(back).toContain('Also depression.');
    expect(back).toMatch(/\[PAN ••234Z\]/);
    expect(back).toMatch(/\[Password hidden\]/);
    expect(back).not.toContain(HEALTH_MASK);
  });
});
