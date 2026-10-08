process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { generateKeyPairSync, randomUUID } from 'crypto';
import { dkimSign } from 'mailauth';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { mountInboundMailBody } from '../src/service-desk/channels.controller';
import { signWebhook } from '../src/service-desk/mail-adapters';
import { SD_DNS_RESOLVER } from '../src/service-desk/mail-out.service';
import { EICAR_TEST_STRING } from '../src/service-desk/scanner';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';

// M14 Service Desk, phase 3b-1 batch 3 (SD-1.18 … SD-1.23, SD-1.28), end to end against the real database (forced RLS,
// the restrictive visibility and portal policies, the app role), Redis and the BullMQ mail jobs. DNS for SPF / DKIM /
// DMARC is a fake zone; signed mail is really DKIM-signed and really checked by mailauth.
describe('Service Desk batch 3: email, portal, banners, customers (M14 §9, §14.3, §14.4, §15.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const fakeBlobs = createFakeBlobStorage();
  const sent: { to: string; subject: string; html: string; text?: string; headers?: Record<string, string>; replyTo?: string; messageId?: string; inReplyTo?: string; dkim?: unknown }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent1' | 'lead' | 'scoped' | 'deskAdmin' | 'divya' | 'hrAgent' | 'agentB' | 'outsiderAgent';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const hook: Record<string, { path: string; secret: string }> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (userId?: string): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: userId ?? null });
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, o = org.A.id) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });

  // ---- fake DNS: a customer domain and the company's staff domain that sign and enforce DMARC, one with p=none ----
  const keys = { cust: generateKeyPairSync('rsa', { modulusLength: 2048 }), staff: generateKeyPairSync('rsa', { modulusLength: 2048 }) };
  const pub = (k: (typeof keys)['cust']) => k.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  const CUST = `cust-${run}.test`;
  const OTHER = `other-${run}.test`;
  const STAFF = `sd3-${run}.test`;
  const LAX = `lax-${run}.test`;
  const zone: Record<string, string[]> = {
    [`TXT:k1._domainkey.${CUST}`]: [`v=DKIM1; k=rsa; p=${pub(keys.cust)}`],
    [`TXT:_dmarc.${CUST}`]: ['v=DMARC1; p=reject'],
    [`TXT:${CUST}`]: ['v=spf1 ip4:203.0.113.5 -all'],
    [`TXT:k1._domainkey.${OTHER}`]: [`v=DKIM1; k=rsa; p=${pub(keys.cust)}`],
    [`TXT:_dmarc.${OTHER}`]: ['v=DMARC1; p=reject'],
    [`TXT:k2._domainkey.${STAFF}`]: [`v=DKIM1; k=rsa; p=${pub(keys.staff)}`],
    [`TXT:_dmarc.${STAFF}`]: ['v=DMARC1; p=reject'],
    [`TXT:${STAFF}`]: ['v=spf1 ip4:203.0.113.9 -all'],
    [`TXT:_dmarc.${LAX}`]: ['v=DMARC1; p=none'],
  };
  const resolver = async (name: string, type: string) => {
    const r = zone[`${type}:${name.toLowerCase()}`];
    if (!r) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
    return r.map((x) => [x]);
  };

  // ---- sending mail in ----
  interface Mail {
    from: string;
    name?: string;
    to?: string;
    cc?: string;
    subject?: string;
    text?: string;
    headers?: string[];
    inReplyTo?: string;
    sign?: 'cust' | 'staff' | 'other';
    ip?: string;
    attach?: { name: string; type: string; data: Buffer };
    messageId?: string;
  }
  const build = async (box: string, m: Mail) => {
    const domain = m.from.split('@')[1];
    const boundary = `b${randomUUID()}`;
    const head = [
      `From: "${m.name ?? 'Someone'}" <${m.from}>`,
      `To: ${m.to ?? box}`,
      ...(m.cc ? [`Cc: ${m.cc}`] : []),
      `Subject: ${m.subject ?? 'Hello'}`,
      `Message-ID: ${m.messageId ?? `<${randomUUID()}@${domain}>`}`,
      `Date: ${new Date().toUTCString()}`,
      ...(m.inReplyTo ? [`In-Reply-To: ${m.inReplyTo}`, `References: ${m.inReplyTo}`] : []),
      ...(m.headers ?? []),
      'MIME-Version: 1.0',
    ];
    const body = m.attach
      ? [`Content-Type: multipart/mixed; boundary="${boundary}"`, '', `--${boundary}`, 'Content-Type: text/plain; charset=utf-8', '', m.text ?? 'Hi', `--${boundary}`, `Content-Type: ${m.attach.type}; name="${m.attach.name}"`, `Content-Disposition: attachment; filename="${m.attach.name}"`, 'Content-Transfer-Encoding: base64', '', m.attach.data.toString('base64'), `--${boundary}--`]
      : ['Content-Type: text/plain; charset=utf-8', '', m.text ?? 'Hi'];
    const msg = [...head, ...body].join('\r\n') + '\r\n';
    if (!m.sign) return Buffer.from(msg);
    const k = m.sign === 'staff' ? keys.staff : keys.cust;
    const signed = await dkimSign(msg, { signatureData: [{ signingDomain: domain, selector: m.sign === 'staff' ? 'k2' : 'k1', privateKey: k.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }] } as never);
    return Buffer.from(signed.signatures + msg);
  };
  const post = (box: string, raw: Buffer, ip = '198.51.100.20', secret?: string, ts = String(Math.floor(Date.now() / 1000)), mailFrom = 'bounce@mx.test') => {
    const env = { ip, helo: 'mx.test', mailFrom, rcptTo: box };
    return request(server())
      .post(hook[box].path)
      .set('content-type', 'message/rfc822')
      .set('x-yukthix-timestamp', ts)
      .set('x-yukthix-signature', signWebhook(secret ?? hook[box].secret, ts, env, raw))
      .set('x-envelope-ip', env.ip)
      .set('x-envelope-helo', env.helo)
      .set('x-envelope-from', env.mailFrom)
      .set('x-envelope-to', env.rcptTo)
      .send(raw);
  };
  const settle = async (id: string) => {
    for (let i = 0; i < 150; i++) {
      const row = await system((tx) => tx.sdInboundEmail.findFirst({ where: { id } }));
      if (row && row.verdict !== 'pending') return row;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`inbound ${id} still pending`);
  };
  const mailIn = async (box: string, m: Mail) => {
    const res = await post(box, await build(box, m), m.ip, undefined, undefined, m.from).expect(202);
    return settle(res.body.id);
  };
  const waitSent = async (pred: (m: (typeof sent)[number]) => boolean) => {
    for (let i = 0; i < 100; i++) {
      const hit = sent.find(pred);
      if (hit) return hit;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('no such email sent');
  };
  const ticket = (id: string) => system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id } }));
  const codeFor = async (email: string) => {
    const m = await waitSent((x) => x.to === email && /\b\d{6}\b/.test(x.text ?? x.html));
    sent.splice(sent.indexOf(m), 1);
    return /\b(\d{6})\b/.exec(m.text ?? m.html)![1];
  };
  const portal = (o: 'A' | 'B' = 'A') => `/api/v1/desk/portal/${org[o].slug}/care`;
  const signIn = async (email: string, o: 'A' | 'B' = 'A') => {
    await request(server()).post(`${portal(o)}/sign-in`).send({ email }).expect(200);
    const code = await codeFor(email);
    return (await request(server()).post(`${portal(o)}/verify`).send({ email, code }).expect(200)).body.token as string;
  };
  const asPortal = (tok: string, method: 'get' | 'post', path: string, o: 'A' | 'B' = 'A') => request(server())[method](`${portal(o)}${path}`).set('x-portal-session', tok);
  /** The P12 code limits live in Redis (this suite's own database): start clean, so reruns within the hour pass. */
  const clearOtp = async (pattern: string) => {
    const redis = app.get(LOGIN_PROTECTION_REDIS, { strict: false }) as { keys: (p: string) => Promise<string[]>; del: (...k: string[]) => Promise<number> };
    const k = await redis.keys(pattern);
    if (k.length) await redis.del(...k);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({
        send: jest.fn(async (m: (typeof sent)[number]) => {
          sent.push(m);
          return { success: true };
        }),
      })
      .overrideProvider(BlobStorageService)
      .useValue(fakeBlobs)
      .overrideProvider(SD_DNS_RESOLVER)
      .useValue(resolver)
      .compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    // Exactly as main.ts: the webhook keeps its raw bytes for the signature.
    mountInboundMailBody(app);
    app.use(json({ limit: '7mb' }));
    app.use(urlencoded({ extended: true }));
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    await clearOtp('auth:otp:*');

    planId = (await prisma.plan.create({ data: { name: `sd3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Desk3 Org ${k}`, slug: `sd3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profiles = new Map<string, string>();
    const profile = async (o: string, key: string) => {
      if (!profiles.has(`${o}:${key}`)) {
        const p = await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }));
        profiles.set(`${o}:${key}`, p.id);
      }
      return profiles.get(`${o}:${key}`)!;
    };
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent1', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['scoped', 'A', 'panel', 'desk_agent'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['hrAgent', 'A', 'panel', 'desk_agent'],
      ['agentB', 'B', 'panel', 'desk_agent'],
      ['outsiderAgent', 'A', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@${STAFF}`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@${STAFF}`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Divya is an employee (her login's person); agent1 also has a person so his email is "someone we know".
    await tenantPrisma.forTenant(asA(), async (tx) => {
      for (const who of ['divya', 'agent1'] as const) {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: who === 'divya' ? 'Divya' : 'Agent', familyName: who === 'divya' ? 'Raghunathan' : 'One', primaryEmail: `${who}@${STAFF}` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users[who], startOn: new Date('2026-01-01') } });
        ids[`${who}Person`] = p.id;
      }
    });

    // Desks: an IT help desk (employees), a Customer support desk, an HR desk; company B has its own customer desk.
    const desk = async (who: Who, name: string, key: string, kind: string) => (await api(who, 'post', '/desk/desks').send({ name, key, kind }).expect(201)).body.id as string;
    ids.it = await desk('adminA', 'IT help', 'IT', 'it');
    ids.care = await desk('adminA', 'Customer Care', 'CARE', 'customer_support');
    ids.hr = await desk('adminA', 'HR help', 'HR', 'hr');
    ids.careB = await desk('adminB', 'B Care', 'BCARE', 'customer_support');
    for (const [d, who, role] of [
      [ids.it, 'agent1', 'agent'],
      [ids.care, 'agent1', 'agent'],
      [ids.care, 'lead', 'lead'],
      [ids.care, 'scoped', 'agent'],
      [ids.care, 'deskAdmin', 'admin'],
      [ids.it, 'deskAdmin', 'admin'],
      [ids.hr, 'hrAgent', 'agent'],
    ] as const) {
      await api('adminA', 'post', `/desk/desks/${d}/members`).send({ userId: users[who], role }).expect(201);
    }
    await api('adminB', 'post', `/desk/desks/${ids.careB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    const full = (await api('adminA', 'get', `/desk/desks/${ids.care}`).expect(200)).body;
    for (const s of full.statuses) ids[`care:${s.label}`] = s.id;
    for (const c of full.categories) ids[`care:${c.name}`] = c.id;
    const itFull = (await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body;
    for (const s of itFull.statuses) ids[`it:${s.label}`] = s.id;

    // Mailboxes (hosted): the webhook address and secret are shown once.
    for (const [key, d, who, address] of [
      ['care', ids.care, 'deskAdmin', `care@kaveri-${run}.test`],
      ['it', ids.it, 'deskAdmin', `it-help@kaveri-${run}.test`],
      ['careB', ids.careB, 'adminB', `care@bcorp-${run}.test`],
    ] as const) {
      const box = (await api(who, 'post', `/desk/desks/${d}/mailboxes`).send({ address, kind: 'hosted' }).expect(201)).body;
      expect(box.signingSecret).toMatch(/^[A-Za-z0-9_-]{40,}$/);
      hook[address] = { path: new URL(box.webhookUrl).pathname, secret: box.signingSecret };
      ids[`box:${key}`] = box.id;
      ids[`addr:${key}`] = address;
    }

    // Customers: Annapurna (two contacts, Asha sees the account's tickets) and Other Co; company B has its own contact.
    const acc = async (who: Who, name: string, domain: string) => (await api(who, 'post', '/desk/customers/accounts').send({ name, emailDomains: [domain] }).expect(201)).body.id as string;
    ids.annapurna = await acc('lead', 'Annapurna', CUST);
    ids.otherCo = await acc('lead', 'Other Co', OTHER);
    const contact = async (accountId: string, name: string, email: string, seesAccountTickets = false) => (await api('lead', 'post', `/desk/customers/accounts/${accountId}/contacts`).send({ name, email, seesAccountTickets }).expect(201)).body.personId as string;
    ids.asha = await contact(ids.annapurna, 'Asha Menon', `asha@${CUST}`, true);
    ids.ravi = await contact(ids.annapurna, 'Ravi Kumar', `ravi@${CUST}`);
    ids.yash = await contact(ids.otherCo, 'Yash Rao', `yash@${OTHER}`);
    await api('lead', 'post', `/desk/customers/accounts/${ids.annapurna}/entitlements`).send({ plan: 'Gold support', tier: 'gold', ticketsAllowed: 100, validFrom: '2026-01-01' }).expect(201);
    await api('lead', 'post', `/desk/customers/accounts/${ids.otherCo}/entitlements`).send({ plan: 'Basic', tier: 'basic', ticketsAllowed: 1, whenUsedUp: 'flag', validFrom: '2026-01-01' }).expect(201);
    // Portals: company A's "care" (sign-up for the customer's domain, open requests on) and company B's "care".
    await api('adminA', 'post', '/desk/portals').send({ slug: 'care', name: 'Care', deskIds: [ids.care], signUp: 'allowed_domains', allowedDomains: [CUST], openRequests: true }).expect(201);
    await api('adminB', 'post', '/desk/portals').send({ slug: 'care', name: 'B Care', deskIds: [ids.careB], signUp: 'open', openRequests: false }).expect(201);
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('the webhook (signed, no session)', () => {
    it('refuses a wrong secret, a changed body, an old timestamp and an unknown token; a provider retry is one email', async () => {
      const box = ids['addr:care'];
      const raw = await build(box, { from: `asha@${CUST}`, sign: 'cust', subject: 'Retry test', messageId: `<retry-${run}@${CUST}>` });
      await post(box, raw, undefined, 'wrong-secret').expect(403);
      await post(box, raw, undefined, undefined, String(Math.floor(Date.now() / 1000) - 900)).expect(403);
      const env = { ip: '198.51.100.20', helo: 'mx.test', mailFrom: 'bounce@mx.test', rcptTo: box };
      const ts = String(Math.floor(Date.now() / 1000));
      await request(server()).post(hook[box].path).set('x-yukthix-timestamp', ts).set('x-yukthix-signature', signWebhook(hook[box].secret, ts, env, raw)).set('x-envelope-ip', env.ip).set('x-envelope-helo', env.helo).set('x-envelope-from', env.mailFrom).set('x-envelope-to', env.rcptTo).set('content-type', 'message/rfc822').send(Buffer.concat([raw, Buffer.from('x')])).expect(403);
      await request(server()).post(`/api/v1/desk/inbound/email/${org.A.id}/${'x'.repeat(43)}`).set('content-type', 'message/rfc822').send(raw).expect(403);
      // Company B's token under company A's id is just another unknown token.
      await request(server()).post(hook[ids['addr:careB']].path.replace(org.B.id, org.A.id)).set('content-type', 'message/rfc822').send(raw).expect(403);
      const first = await post(box, raw).expect(202);
      const again = await post(box, raw).expect(202);
      expect(again.body).toEqual({ accepted: true, duplicate: true });
      const row = await settle(first.body.id);
      expect(row).toMatchObject({ verdict: 'accepted', senderVerified: true, signed: true, dmarc: 'pass' });
      ids.retryTicket = row.ticketId!;
    });
  });

  describe('spoofing (§14.3, founder rule)', () => {
    it('a spoofed copy of a known customer fails DMARC p=reject and is held; nothing is made; the desk admin can release it', async () => {
      const row = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, subject: 'Please change our bank account', text: 'Send money to the new account.' });
      expect(row).toMatchObject({ verdict: 'held', senderVerified: false, dmarc: 'fail', dmarcPolicy: 'reject', ticketId: null });
      expect(row.reason).toMatch(/DMARC/);
      const held = (await api('deskAdmin', 'get', `/desk/desks/${ids.care}/inbound-emails?verdict=held`).expect(200)).body;
      expect(held.some((h: { id: string }) => h.id === row.id)).toBe(true);
      // Agents cannot see or release held mail; company B cannot reach it at all.
      await api('agent1', 'get', `/desk/desks/${ids.care}/inbound-emails`).expect(403);
      await api('adminB', 'post', `/desk/desks/${ids.care}/inbound-emails/${row.id}/release`).expect(404);
      const released = (await api('deskAdmin', 'post', `/desk/desks/${ids.care}/inbound-emails/${row.id}/release`).expect(200)).body;
      expect(released.verdict).toBe('accepted');
      ids.ashaOnly = released.ticketId;
      const t = await ticket(released.ticketId);
      // Released by a person, but it still shows the sender was not proven.
      expect(t).toMatchObject({ requesterPersonId: ids.asha, senderVerified: false, channel: 'email' });
    });

    it('an unproven sender using a known address is held, never linked; an unknown one gets a ticket marked "not verified" and no reply', async () => {
      // Kim is a known contact on a domain whose DMARC is only p=none: her unproven mail comes in, but is held, not linked.
      await api('lead', 'post', `/desk/customers/accounts/${ids.otherCo}/contacts`).send({ name: 'Kim Lee', email: `kim@${LAX}` }).expect(201);
      const known = await mailIn(ids['addr:care'], { from: `kim@${LAX}`, subject: 'Hi' });
      expect(known).toMatchObject({ verdict: 'held', ticketId: null, reason: expect.stringMatching(/someone we know/) });
      const before = sent.length;
      const unknown = await mailIn(ids['addr:care'], { from: `stranger@${LAX}`, name: 'Stranger Danger', subject: 'Where is my order' });
      // DMARC fails, but the domain only asks for reports (p=none): it comes in, not verified.
      expect(unknown).toMatchObject({ verdict: 'accepted', senderVerified: false, dmarc: 'fail', dmarcPolicy: 'none' });
      expect(unknown.flags).toContain('sender_not_verified');
      const t = await ticket(unknown.ticketId!);
      expect(t.senderVerified).toBe(false);
      const person = await system((tx) => tx.person.findFirstOrThrow({ where: { id: t.requesterPersonId } }));
      expect(person.primaryEmail).toBe(`stranger@${LAX}`);
      // Not joined to any account (that needs a proven sender).
      expect(await system((tx) => tx.sdCustomerContact.findFirst({ where: { personId: person.id } }))).toMatchObject({ accountId: null });
      await new Promise((r) => setTimeout(r, 500));
      expect(sent.slice(before).filter((m) => m.to === `stranger@${LAX}`)).toEqual([]);
      // The agent sees the warning.
      const view = (await api('agent1', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
      expect(view.senderVerified).toBe(false);
      expect(view.messages[0].senderVerified).toBe(false);
    });

    it('mail claiming the company\'s own domain without its signature is rejected; a display-name trick is flagged', async () => {
      const own = await mailIn(ids['addr:care'], { from: `ceo@kaveri-${run}.test`, subject: 'Urgent wire' });
      expect(own).toMatchObject({ verdict: 'rejected' });
      const trick = await mailIn(ids['addr:care'], { from: `divya.r@${CUST}`, name: 'Divya Raghunathan', sign: 'cust', subject: 'New laptop please' });
      expect(trick.flags).toContain('display_name_lookalike');
    });
  });

  describe('new tickets from email (SD-1.19, SD-1.20, SD-1.28)', () => {
    it('a proven customer: ticket on their account with the plan tier, CC follows, acknowledgement with the number and Auto-Submitted', async () => {
      const row = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, name: 'Asha Menon', sign: 'cust', cc: `ravi@${CUST}, newbie@${CUST}`, subject: 'Order 4471 is late', text: 'Our order has not arrived.\n\nOn Mon, someone wrote:\n> old text' });
      expect(row.verdict).toBe('accepted');
      const t = await ticket(row.ticketId!);
      expect(t).toMatchObject({ customerAccountId: ids.annapurna, planTier: 'gold', channel: 'email', senderVerified: true });
      ids.emailTicket = t.id;
      const first = await system((tx) => tx.sdTicketMessage.findFirstOrThrow({ where: { ticketId: t.id }, orderBy: { createdAt: 'asc' } }));
      // Quoted history is cut.
      expect(first.bodyText).toBe('Our order has not arrived.');
      const watchers = await system((tx) => tx.sdTicketWatcher.findMany({ where: { ticketId: t.id } }));
      expect(watchers.map((w) => w.personId)).toContain(ids.ravi);
      // A new colleague of the customer in CC becomes a contact of the account by their domain (US-G-221).
      const newbie = await system((tx) => tx.person.findFirstOrThrow({ where: { organizationId: org.A.id, primaryEmail: `newbie@${CUST}` } }));
      expect(await system((tx) => tx.sdCustomerContact.findFirst({ where: { personId: newbie.id } }))).toMatchObject({ accountId: ids.annapurna });
      const ack = await waitSent((m) => m.to === `asha@${CUST}` && m.subject.includes(t.number));
      expect(ack.headers).toMatchObject({ 'Auto-Submitted': 'auto-replied' });
      expect(ack.html).toContain(t.number);
      expect(ack.replyTo).toMatch(new RegExp(`^care\\+t\\.${t.number.toLowerCase()}\\.[0-9a-f]{12}@kaveri-${run}\\.test$`));
      // D9: no images (so no tracking pixels) in anything we send.
      expect(sent.every((m) => !/<img/i.test(m.html))).toBe(true);
    });

    it('employee desk: a proven colleague raises; an outsider is held', async () => {
      const ok = await mailIn(ids['addr:it'], { from: `divya@${STAFF}`, sign: 'staff', subject: 'Printer jam', text: 'Second floor printer.' });
      expect(ok.verdict).toBe('accepted');
      expect((await ticket(ok.ticketId!)).requesterPersonId).toBe(ids.divyaPerson);
      const out = await mailIn(ids['addr:it'], { from: `someone@${CUST}`, sign: 'cust', subject: 'Hello IT' });
      expect(out).toMatchObject({ verdict: 'held', reason: 'Not someone in your company' });
    });

    it('loops and automatic mail never make tickets; 20 a sender in 10 minutes, then held', async () => {
      expect((await mailIn(ids['addr:care'], { from: ids['addr:it'], subject: 'loop' })).verdict).toBe('loop');
      expect((await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', headers: ['Auto-Submitted: auto-replied'], subject: 'Out of office' })).verdict).toBe('loop');
      expect((await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', headers: ['Precedence: bulk'], subject: 'News' })).verdict).toBe('loop');
      const flood = `flood@${CUST}`;
      await system((tx) =>
        tx.sdInboundEmail.createMany({ data: Array.from({ length: 21 }, (_, i) => ({ organizationId: org.A.id, mailboxId: ids['box:care'], deskId: ids.care, messageId: `<flood-${i}-${run}@x>`, fromAddress: flood, verdict: 'loop' })) }),
      );
      expect(await mailIn(ids['addr:care'], { from: flood, sign: 'cust', subject: 'More' })).toMatchObject({ verdict: 'held', reason: expect.stringMatching(/More than 20/) });
    });

    it('email rules route, tag, prioritise, read fields and reject (plain text only)', async () => {
      const r = (b: object) => api('deskAdmin', 'post', `/desk/desks/${ids.care}/mailboxes/${ids['box:care']}/rules`).send(b).expect(201);
      await r({ name: 'Billing words', field: 'subject', op: 'contains', value: 'invoice', action: 'route', actionValue: { categoryId: ids['care:Billing'] }, sortOrder: 1 });
      await r({ name: 'Urgent', field: 'subject', op: 'starts_with', value: 'urgent', action: 'priority', actionValue: { priority: 1 }, sortOrder: 2 });
      await r({ name: 'Order no', field: 'body', op: 'contains', value: 'order number', action: 'parse_field', actionValue: { key: 'Order number', field: 'order_number' }, sortOrder: 3 });
      const blocked = (await r({ name: 'Blocked', field: 'domain', op: 'equals', value: OTHER, action: 'reject', sortOrder: 0 })).body.id;
      // An admin-written pattern never runs as a regular expression.
      await api('deskAdmin', 'post', `/desk/desks/${ids.care}/mailboxes/${ids['box:care']}/rules`).send({ name: 'x', field: 'subject', op: 'matches', value: '(a+)+$', action: 'tag', actionValue: { tag: 'x' } }).expect(400);
      const row = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', subject: 'URGENT invoice copy', text: 'Please resend.\nOrder number: 77881\nThanks' });
      expect(await ticket(row.ticketId!)).toMatchObject({ categoryId: ids['care:Billing'], priority: 1, custom: { order_number: '77881' } });
      expect(await mailIn(ids['addr:care'], { from: `yash@${OTHER}`, sign: 'other', subject: 'hello' })).toMatchObject({ verdict: 'rejected', reason: 'Rule "Blocked"' });
      await api('agent1', 'post', `/desk/desks/${ids.care}/mailboxes/${ids['box:care']}/rules`).send({ name: 'x', field: 'subject', op: 'contains', value: 'x', action: 'reject' }).expect(403);
      await api('deskAdmin', 'delete', `/desk/desks/${ids.care}/mailboxes/${ids['box:care']}/rules/${blocked}`).expect(200);
    });

    it('files go through the type list and the virus scan; a renamed program and a virus are stopped', async () => {
      const exe = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', subject: 'Files', attach: { name: 'invoice.pdf', type: 'application/pdf', data: Buffer.from('MZ\x90\x00 not a pdf') } });
      const notes = await system((tx) => tx.sdTicketMessage.findMany({ where: { ticketId: exe.ticketId!, kind: 'system' } }));
      expect(notes[0].bodyText).toMatch(/invoice\.pdf: invoice\.pdf was not added/);
      const virus = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', subject: 'More files', attach: { name: 'notes.txt', type: 'text/plain', data: Buffer.from(EICAR_TEST_STRING) } });
      let file = await system((tx) => tx.sdAttachment.findFirstOrThrow({ where: { ticketId: virus.ticketId! } }));
      for (let i = 0; i < 100 && file.scanStatus === 'pending'; i++) {
        await new Promise((r) => setTimeout(r, 100));
        file = await system((tx) => tx.sdAttachment.findFirstOrThrow({ where: { ticketId: virus.ticketId! } }));
      }
      expect(file).toMatchObject({ scanStatus: 'infected', side: 'requester' });
    });

    it('a used-up plan flags the ticket', async () => {
      // Other Co's plan allows 1 ticket a month: the agent raises one, the next one is flagged.
      await api('agent1', 'post', '/desk/tickets').send({ deskId: ids.care, requesterPersonId: ids.yash, subject: 'One', bodyHtml: '<p>one</p>' }).expect(201);
      const second = (await api('agent1', 'post', '/desk/tickets').send({ deskId: ids.care, requesterPersonId: ids.yash, subject: 'Two', bodyHtml: '<p>two</p>' }).expect(201)).body;
      expect((await ticket(second.id)).tags).toContain('plan-used-up');
    });
  });

  describe('threading, replies out and commands (SD-1.18, SD-1.19, SD-1.20)', () => {
    it('an agent reply goes out threaded and signed-token; the reply back (headers, or the token alone) lands on the same ticket', async () => {
      const t = await ticket(ids.emailTicket);
      await api('agent1', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>It ships today.</p>' }).expect(201);
      const out = await waitSent((m) => m.to === `asha@${CUST}` && m.html.includes('It ships today'));
      expect(out.messageId).toMatch(/^<sd\.[0-9a-f-]{36}@kaveri-/);
      expect(out.inReplyTo).toMatch(new RegExp(`@${CUST}>$`));
      expect(out.headers).toBeUndefined();
      // By In-Reply-To.
      const r1 = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', subject: 'Re: whatever', inReplyTo: out.messageId, text: 'Thank you!' });
      expect(r1).toMatchObject({ verdict: 'accepted', ticketId: t.id });
      // By the signed token in the address alone (no headers, a new subject).
      const r2 = await mailIn(ids['addr:care'], { from: `ravi@${CUST}`, sign: 'cust', to: out.replyTo, subject: 'Also', text: 'Same here.' });
      expect(r2).toMatchObject({ verdict: 'accepted', ticketId: t.id });
      // By the number in the subject, only from someone on the ticket.
      const r3 = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', subject: `Question on ${t.number}`, text: 'One more thing.' });
      expect(r3.ticketId).toBe(t.id);
      const r4 = await mailIn(ids['addr:care'], { from: `yash@${OTHER}`, sign: 'other', subject: `About ${t.number}` });
      expect(r4.ticketId).not.toBe(t.id);
      // A forged token is no token.
      const r5 = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', to: out.replyTo!.replace(/\.[0-9a-f]{12}@/, '.000000000000@'), subject: 'Forged' });
      expect(r5.ticketId).not.toBe(t.id);
    });

    it('a reply on the thread from an unproven sender, or from someone not on the ticket, is held', async () => {
      const t = await ticket(ids.emailTicket);
      const out = await waitSent((m) => m.to === `asha@${CUST}` && m.html.includes('It ships today'));
      expect(await mailIn(ids['addr:care'], { from: `asha@${CUST}`, ip: '198.51.100.1', to: out.replyTo, subject: 'spoofed reply' })).toMatchObject({ verdict: 'held', ticketId: null });
      expect(await mailIn(ids['addr:care'], { from: `yash@${OTHER}`, sign: 'other', to: out.replyTo, subject: 'not mine' })).toMatchObject({ verdict: 'held', reason: expect.stringMatching(/not on the ticket/) });
      expect((await ticket(t.id)).id).toBe(t.id);
    });

    it('commands: a signed agent sets status and priority; an agent email not signed is held; the requester closes; unknown commands get help', async () => {
      const t = await ticket(ids.emailTicket);
      const out = await waitSent((m) => m.to === `asha@${CUST}` && m.html.includes('It ships today'));
      // agent1's mail is signed by the staff domain.
      const a = await mailIn(ids['addr:care'], { from: `agent1@${STAFF}`, sign: 'staff', to: out.replyTo, text: '#priority 2\n#status Waiting on customer\nAsked the courier.' });
      expect(a.verdict).toBe('accepted');
      expect(await ticket(t.id)).toMatchObject({ priority: 2, statusId: ids['care:Waiting on customer'] });
      const note = await system((tx) => tx.sdTicketMessage.findFirstOrThrow({ where: { ticketId: t.id, kind: 'note' }, orderBy: { createdAt: 'desc' } }));
      expect(note).toMatchObject({ authorUserId: users.agent1, bodyText: 'Asked the courier.' });
      // SPF passes but nothing is signed: commands need a signature.
      expect(await mailIn(ids['addr:care'], { from: `agent1@${STAFF}`, ip: '203.0.113.9', to: out.replyTo, text: '#status Solved' })).toMatchObject({ verdict: 'held', reason: expect.stringMatching(/not signed/) });
      // An agent without a seat on this desk cannot command it.
      expect(await mailIn(ids['addr:care'], { from: `outsiderAgent@${STAFF}`, sign: 'staff', to: out.replyTo, text: '#status Solved' })).toMatchObject({ verdict: 'held' });
      const help = await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', to: out.replyTo, text: '#approve\nok' });
      expect(help.verdict).toBe('accepted');
      const helpMail = await waitSent((m) => m.to === `asha@${CUST}` && m.subject.includes('About your command'));
      expect(helpMail.headers).toMatchObject({ 'Auto-Submitted': 'auto-replied' });
      await mailIn(ids['addr:care'], { from: `asha@${CUST}`, sign: 'cust', to: out.replyTo, text: '#close' });
      expect((await ticket(t.id)).systemState).toBe('solved');
    });

    it('bounces fill the bounce list; nothing is sent to a bounced address until it is cleared', async () => {
      const dsn = Buffer.from(
        [
          `From: MAILER-DAEMON@${CUST}`,
          `To: ${ids['addr:care']}`,
          'Subject: Undelivered',
          `Message-ID: <dsn-${run}@${CUST}>`,
          'MIME-Version: 1.0',
          'Content-Type: multipart/report; report-type=delivery-status; boundary="r"',
          '',
          '--r',
          'Content-Type: text/plain',
          '',
          'Could not deliver.',
          '--r',
          'Content-Type: message/delivery-status',
          '',
          'Reporting-MTA: dns; mx.test',
          '',
          `Final-Recipient: rfc822; ravi@${CUST}`,
          'Action: failed',
          'Status: 5.1.1',
          '--r--',
          '',
        ].join('\r\n'),
      );
      expect((await settle((await post(ids['addr:care'], dsn).expect(202)).body.id)).verdict).toBe('bounce');
      const list = (await api('deskAdmin', 'get', '/desk/bounces').expect(200)).body;
      const b = list.find((x: { address: string }) => x.address === `ravi@${CUST}`);
      expect(b).toMatchObject({ kind: 'bounce' });
      const t = (await api('agent1', 'post', '/desk/tickets').send({ deskId: ids.care, requesterPersonId: ids.ravi, subject: 'For Ravi', bodyHtml: '<p>x</p>' }).expect(201)).body;
      const before = sent.length;
      await api('agent1', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>Hello Ravi</p>' }).expect(201);
      await new Promise((r) => setTimeout(r, 2500));
      expect(sent.slice(before).filter((m) => m.to === `ravi@${CUST}`)).toEqual([]);
      await api('deskAdmin', 'post', `/desk/bounces/${b.id}/clear`).expect(200);
    });
  });

  describe('sending domains (SD-1.18)', () => {
    it('shows the three DNS records and checks them', async () => {
      await api('deskAdmin', 'post', '/desk/sending-domains').send({ domain: STAFF }).expect(201);
      await api('deskAdmin', 'post', '/desk/sending-domains').send({ domain: STAFF }).expect(409);
      const d = (await api('deskAdmin', 'get', '/desk/sending-domains').expect(200)).body.find((x: { domain: string }) => x.domain === STAFF);
      expect(d.records.map((r: { host: string }) => r.host)).toEqual([STAFF, `yukthix._domainkey.${STAFF}`, `_dmarc.${STAFF}`]);
      const dkim = d.records[1].value as string;
      zone[`TXT:yukthix._domainkey.${STAFF}`] = [dkim];
      zone[`TXT:${STAFF}`] = [`v=spf1 ip4:203.0.113.9 include:_spf.yukthix.com -all`];
      const checked = (await api('deskAdmin', 'post', `/desk/sending-domains/${d.id}/verify-dns`).expect(200)).body;
      expect(checked).toMatchObject({ status: 'verified' });
      expect(checked.records.map((r: { ok: boolean }) => r.ok)).toEqual([true, true, true]);
      await api('agent1', 'get', '/desk/sending-domains').expect(403);
    });
  });

  describe('the outside portal (SD-1.21, SD-1.22)', () => {
    it('public look; codes only for allowed people; wrong codes fail; a session sees its own tickets and, as customer admin, the account\'s', async () => {
      const info = (await request(server()).get(portal()).expect(200)).body;
      expect(info).toMatchObject({ portal: { name: 'Care', openRequests: true }, desks: [{ id: ids.care }] });
      // A colleague's email, or a stranger's domain, gets the same answer and no code.
      const mark = sent.length;
      for (const email of [`divya@${STAFF}`, `x@unknown-${run}.test`]) {
        expect((await request(server()).post(`${portal()}/sign-in`).send({ email }).expect(200)).body).toEqual({ sent: true });
      }
      await new Promise((r) => setTimeout(r, 300));
      expect(sent.slice(mark).filter((m) => m.to === `divya@${STAFF}` || m.to === `x@unknown-${run}.test`)).toEqual([]);
      await request(server()).post(`${portal()}/sign-in`).send({ email: `ravi@${CUST}` }).expect(200);
      const code = await codeFor(`ravi@${CUST}`);
      await request(server()).post(`${portal()}/verify`).send({ email: `ravi@${CUST}`, code: code === '000000' ? '000001' : '000000' }).expect(401);
      const ravi = (await request(server()).post(`${portal()}/verify`).send({ email: `ravi@${CUST}`, code }).expect(200)).body.token as string;
      // A code works once.
      await request(server()).post(`${portal()}/verify`).send({ email: `ravi@${CUST}`, code }).expect(401);
      const asha = await signIn(`asha@${CUST}`);
      ids.ashaToken = asha;
      ids.raviToken = ravi;
      expect((await asPortal(asha, 'get', '/me').expect(200)).body).toMatchObject({ account: 'Annapurna', seesAccountTickets: true });
      const raised = (await asPortal(ravi, 'post', '/tickets').send({ deskId: ids.care, subject: 'Packets leaking', description: 'Two packets were open.' }).expect(201)).body;
      ids.raviTicket = raised.id;
      expect(await ticket(raised.id)).toMatchObject({ customerAccountId: ids.annapurna, planTier: 'gold', channel: 'portal' });
      // Asha (customer admin contact) sees Ravi's ticket; Ravi does not see Asha's.
      expect((await asPortal(asha, 'get', '/tickets').expect(200)).body.map((t: { id: string }) => t.id)).toContain(raised.id);
      // Ravi follows the email ticket he was copied on, but not Asha's own.
      const ravis = (await asPortal(ravi, 'get', '/tickets').expect(200)).body.map((t: { id: string }) => t.id);
      expect(ravis).toContain(ids.emailTicket);
      expect(ravis).not.toContain(ids.ashaOnly);
      await asPortal(ravi, 'get', `/tickets/${ids.ashaOnly}`).expect(404);
      expect((await asPortal(asha, 'get', '/tickets').expect(200)).body.map((t: { id: string }) => t.id)).toContain(ids.ashaOnly);
      await asPortal('x'.repeat(43), 'get', '/tickets').expect(401);
    });

    it('agent replies, the customer sees it (never the internal note); the customer replies back', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.raviTicket}/messages`).send({ kind: 'note', bodyHtml: '<p>Internal: courier issue</p>' }).expect(201);
      await api('agent1', 'post', `/desk/tickets/${ids.raviTicket}/messages`).send({ kind: 'reply', bodyHtml: '<p>We are sending new packets.</p>' }).expect(201);
      const view = (await asPortal(ids.raviToken, 'get', `/tickets/${ids.raviTicket}`).expect(200)).body;
      expect(view.messages.map((m: { bodyHtml: string }) => m.bodyHtml).join()).toContain('We are sending new packets.');
      expect(JSON.stringify(view)).not.toContain('courier issue');
      // A portal ticket's outside requester gets a short notice by email with the portal link (not the reply itself).
      const notice = await waitSent((m) => m.to === `ravi@${CUST}` && m.html.includes('new reply'));
      expect(notice.html).toContain(`/yx/portal/${org.A.slug}/care?ticket=${ids.raviTicket}`);
      await asPortal(ids.raviToken, 'post', `/tickets/${ids.raviTicket}/messages`).send({ text: 'Thank you.' }).expect(201);
      const agentView = (await api('agent1', 'get', `/desk/tickets/${ids.raviTicket}`).expect(200)).body;
      expect(agentView.messages.at(-1)).toMatchObject({ side: 'requester', bodyHtml: '<p>Thank you.</p>' });
      expect(agentView.customer).toMatchObject({ account: { name: 'Annapurna' }, plan: 'gold' });
    });

    it('in SQL: a portal session reads only its own tickets, no notes, and cannot write a ticket for someone else', async () => {
      const asPerson = <T>(personId: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
        tenantPrisma.forTenant(asA(), async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.portal_person_id', ${personId}, true)`;
          return fn(tx);
        });
      const all = await system((tx) => tx.sdTicket.count({ where: { deskId: ids.care } }));
      const ravis = await asPerson(ids.ravi, (tx) => tx.sdTicket.findMany({ where: {}, select: { requesterPersonId: true, id: true } }));
      expect(all).toBeGreaterThan(ravis.length);
      for (const t of ravis) expect([ids.ravi].includes(t.requesterPersonId) || (await system((tx) => tx.sdTicketWatcher.count({ where: { ticketId: t.id, personId: ids.ravi } }))) > 0).toBe(true);
      expect(await asPerson(ids.ravi, (tx) => tx.sdTicketMessage.count({ where: { ticketId: ids.raviTicket, kind: 'note' } }))).toBe(0);
      expect(await asPerson(ids.ravi, (tx) => tx.sdInboundEmail.count())).toBe(0);
      // Asha sees the account's tickets through her customer-admin contact.
      expect(await asPerson(ids.asha, (tx) => tx.sdTicket.count({ where: { id: ids.raviTicket } }))).toBe(1);
      expect(await asPerson(ids.yash, (tx) => tx.sdTicket.count({ where: { id: ids.raviTicket } }))).toBe(0);
      const desk = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.raviTicket } }));
      await expect(
        asPerson(ids.ravi, (tx) =>
          tx.sdTicket.create({ data: { organizationId: org.A.id, deskId: ids.care, seq: 999999, number: `CARE-X${run}`, typeId: desk.typeId, statusId: desk.statusId, priority: 3, subject: 'forged', requesterPersonId: ids.asha, channel: 'portal' } }),
        ),
      ).rejects.toThrow();
    });

    it('sign-up for an allowed domain makes a new contact; open requests confirm by email link once; limits apply', async () => {
      const newbie = await signIn(`newcomer@${CUST}`);
      expect((await asPortal(newbie, 'get', '/me').expect(200)).body).toMatchObject({ account: 'Annapurna', seesAccountTickets: false });
      await request(server()).post(`${portal()}/requests`).send({ email: `walkin@${CUST}`, name: 'Walk In', deskId: ids.care, subject: 'Price list', description: 'Please send the price list.' }).expect(202);
      const link = await waitSent((m) => m.to === `walkin@${CUST}` && m.html.includes('confirm?token='));
      const tok = /token=([A-Za-z0-9_-]+)/.exec(link.html)![1];
      const done = (await request(server()).post(`${portal()}/requests/confirm`).send({ token: tok }).expect(200)).body;
      expect(done.number).toMatch(/^CARE-/);
      expect((await asPortal(done.token, 'get', '/tickets').expect(200)).body.map((t: { id: string }) => t.id)).toEqual([done.id]);
      await request(server()).post(`${portal()}/requests/confirm`).send({ token: tok }).expect(409);
      // 5 sends per email an hour (the P12 code limits): the sixth is refused.
      const many = `many@${CUST}`;
      const codes = [];
      for (let i = 0; i < 6; i++) {
        codes.push((await request(server()).post(`${portal()}/requests`).send({ email: many, name: 'M', deskId: ids.care, subject: `s${i}`, description: 'd' })).status);
        // The P12 limiter also has a 60-second cooldown per email; clear it so the hourly cap is what we test.
        await clearOtp('auth:otp:cool:*');
      }
      expect(codes.slice(0, 5).every((s) => s === 202)).toBe(true);
      expect(codes[5]).toBe(429);
    });

    it('company B: its portal never reads company A, and A\'s session means nothing there', async () => {
      await asPortal(ids.ashaToken, 'get', '/tickets', 'B').expect(401);
      const b = await signIn(`buyer@b-${run}.test`, 'B');
      const list = (await asPortal(b, 'get', '/tickets', 'B').expect(200)).body;
      expect(list).toEqual([]);
      await asPortal(b, 'get', `/tickets/${ids.raviTicket}`, 'B').expect(404);
      await api('agentB', 'get', `/desk/customers/accounts/${ids.annapurna}`).expect(404);
      await api('agentB', 'get', `/desk/tickets/${ids.raviTicket}`).expect(404);
    });

    it('a contact turned off loses the portal at once', async () => {
      const contacts = (await api('lead', 'get', `/desk/customers/accounts/${ids.annapurna}`).expect(200)).body.contacts;
      const ravi = contacts.find((c: { personId: string }) => c.personId === ids.ravi);
      await api('lead', 'patch', `/desk/customers/contacts/${ravi.id}`).send({ status: 'inactive' }).expect(200);
      await asPortal(ids.raviToken, 'get', '/tickets').expect(401);
      await api('lead', 'patch', `/desk/customers/contacts/${ravi.id}`).send({ status: 'active' }).expect(200);
    });
  });

  describe('banners (SD-1.23)', () => {
    it('an agent links a banner to an open incident; "me too" follows it; it ends when the incident is solved; never a private ticket', async () => {
      const inc = (await api('agent1', 'post', '/desk/tickets').send({ deskId: ids.it, requesterPersonId: ids.divyaPerson, subject: 'Wi-Fi down', bodyHtml: '<p>down</p>' }).expect(201)).body;
      const b = (await api('agent1', 'post', `/desk/desks/${ids.it}/banners`).send({ text: 'Wi-Fi is down on floor 2', severity: 'outage', audience: 'employees', ticketId: inc.id }).expect(201)).body;
      const priv = (await api('agent1', 'post', '/desk/tickets').send({ deskId: ids.it, requesterPersonId: ids.divyaPerson, subject: 'Private', bodyHtml: '<p>p</p>', private: true }).expect(201)).body;
      await api('agent1', 'post', `/desk/desks/${ids.it}/banners`).send({ text: 'x', severity: 'info', audience: 'everyone', ticketId: priv.id }).expect(400);
      await api('divya', 'get', '/desk/my/banners').expect(200);
      const mine = (await api('divya', 'get', '/desk/my/banners').expect(200)).body;
      expect(mine).toEqual(expect.arrayContaining([expect.objectContaining({ id: b.id, canMeToo: true, meToo: false })]));
      // Someone else (agent1's own person) says me too and then follows the incident.
      await api('agent1', 'post', `/desk/my/banners/${b.id}/me-too`).expect(200);
      expect(await system((tx) => tx.sdTicketWatcher.count({ where: { ticketId: inc.id, personId: ids.agent1Person } }))).toBe(1);
      expect((await api('agent1', 'get', `/desk/desks/${ids.it}/banners`).expect(200)).body.find((x: { id: string }) => x.id === b.id).meToo).toBe(1);
      // Customer banners show on the portal, employee ones do not.
      expect((await request(server()).get(portal()).expect(200)).body.banners.map((x: { id: string }) => x.id)).not.toContain(b.id);
      await api('agent1', 'patch', `/desk/tickets/${inc.id}`).send({ version: (await ticket(inc.id)).version, statusId: ids['it:Resolved'] }).expect(200);
      expect((await api('divya', 'get', '/desk/my/banners').expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(b.id);
      await api('divya', 'post', `/desk/my/banners/${b.id}/me-too`).expect(404);
      // Only agents of the desk post banners.
      await api('hrAgent', 'post', `/desk/desks/${ids.it}/banners`).send({ text: 'x', severity: 'info', audience: 'everyone' }).expect(403);
    });
  });

  describe('customers and agent scope (SD-1.28)', () => {
    it('an agent limited to Other Co sees none of Annapurna\'s tickets or contacts', async () => {
      await api('lead', 'put', `/desk/customers/agents/${users.scoped}/accounts`).send({ accountIds: [ids.otherCo] }).expect(200);
      await api('scoped', 'get', `/desk/tickets/${ids.raviTicket}`).expect(404);
      const list = (await api('scoped', 'get', `/desk/tickets?deskIds=${ids.care}`).expect(200)).body.items;
      expect(list.every((t: { customerAccountId: string | null }) => t.customerAccountId === ids.otherCo)).toBe(true);
      expect((await api('scoped', 'get', '/desk/customers/accounts').expect(200)).body.map((a: { id: string }) => a.id)).toEqual([ids.otherCo]);
      await api('scoped', 'get', `/desk/customers/accounts/${ids.annapurna}`).expect(404);
      await api('scoped', 'post', '/desk/tickets').send({ deskId: ids.care, requesterPersonId: ids.asha, subject: 'x', bodyHtml: '<p>x</p>' }).expect(400);
      // Agents without desk.customer.manage cannot change customers; public mail domains never belong to an account.
      await api('agent1', 'post', '/desk/customers/accounts').send({ name: 'Nope' }).expect(403);
      await api('lead', 'post', '/desk/customers/accounts').send({ name: 'Gmail people', emailDomains: ['gmail.com'] }).expect(400);
      await api('lead', 'post', '/desk/customers/accounts').send({ name: 'Dup', emailDomains: [CUST] }).expect(409);
    });

    it('a company group shares its plan with sub-accounts unless they have their own', async () => {
      const child = (await api('lead', 'post', '/desk/customers/accounts').send({ name: 'Annapurna Hyderabad', parentId: ids.annapurna }).expect(201)).body.id;
      expect((await api('lead', 'get', `/desk/customers/accounts/${child}`).expect(200)).body.plan).toMatchObject({ tier: 'gold', inherited: true });
      await api('lead', 'patch', `/desk/customers/accounts/${ids.annapurna}`).send({ version: 1, parentId: child }).expect(400);
    });
  });

  describe('founder decisions (8 Oct 2026)', () => {
    it('HR desk agents see health words on a restricted ticket; other masks stay; other desks keep them masked', async () => {
      const hr = (await api('adminA', 'get', `/desk/desks/${ids.hr}`).expect(200)).body;
      const medical = hr.categories.find((c: { name: string }) => c.name === 'Medical and insurance').id;
      const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.hr, categoryId: medical, subject: 'Leave for chemotherapy', description: 'I start chemotherapy next week. My PAN is ABCPK1234Z.' }).expect(201)).body;
      const view = (await api('hrAgent', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
      expect(view.subject).toBe('Leave for chemotherapy');
      expect(view.messages[0].bodyHtml).toContain('chemotherapy next week');
      expect(view.messages[0].bodyHtml).toContain('[PAN ••234Z]');
      // Stored masked; the requester's own view and an IT ticket keep the mask.
      expect((await ticket(t.id)).subject).toContain('[Health detail hidden]');
      const it = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Monitor', description: 'My diabetes app needs a bigger screen.', private: true }).expect(201)).body;
      expect((await api('agent1', 'get', `/desk/tickets/${it.id}`).expect(200)).body.messages[0].bodyHtml).toContain('[Health detail hidden]');
    });

    it('a follower loses sight of a ticket once it becomes private', async () => {
      const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Shared drive', description: 'Cannot open it.' }).expect(201)).body;
      await api('agent1', 'post', `/desk/tickets/${t.id}/watchers`).send({ personId: ids.agent1Person }).expect(201);
      await api('agent1', 'get', `/desk/my/tickets/${t.id}`).expect(200);
      const v = (await ticket(t.id)).version;
      await api('agent1', 'patch', `/desk/tickets/${t.id}`).send({ version: v, private: true }).expect(200);
      // agent1 still works it as an agent, but as a follower (requester side) it is gone.
      await api('agent1', 'get', `/desk/my/tickets/${t.id}`).expect(404);
      expect((await api('agent1', 'get', '/desk/my/tickets').expect(200)).body.map((x: { id: string }) => x.id)).not.toContain(t.id);
    });
  });
});
