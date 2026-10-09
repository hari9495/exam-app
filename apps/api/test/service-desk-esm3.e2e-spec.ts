process.env.SD_SCANNER = 'dev-fake';
process.env.APPROVAL_CHANNELS = 'dev-fake';
process.env.DESK_CHANNELS = 'dev-fake';
process.env.REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/15';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { ApprovalCards, FakeChannelTransport } from '../src/workflow/approval-channels';
import { mountInboundMsgBody } from '../src/service-desk/esm3.controller';
import { signYukthix } from '../src/service-desk/messaging';
import { FakeMsgTransport, MessagingService } from '../src/service-desk/messaging.service';
import { DevMailboxPoller, MailboxSyncService } from '../src/service-desk/mailbox-sync.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// M14 Service Desk phase 3b-2 batch 3 end to end, against the real database (forced RLS, owner-only rows), Redis and
// the reply job: WhatsApp / SMS / Teams lines with signed webhooks and replay windows, opt-in by JOIN code, STOP and
// START, what may go out (window, templates, private tickets), two-company isolation, agents in Teams, skill / language /
// capacity routing, shifts and the forecast, the help widget's signed sign-in, agent mailbox sync for matched threads,
// phone drafts with conflict checks, SLA pushes, and the HR starter pack that asks before restricting a desk.
describe('Service Desk 3b-2 batch 3', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let fake: FakeMsgTransport;
  let cards: FakeChannelTransport;
  let messaging: MessagingService;
  let mailSync: MailboxSyncService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'emp' | 'other' | 'empB' | 'agentB' | 'netAg' | 'plainAg';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const lines: Record<string, { path: string; secret: string; id: string }> = {};
  const phone = (n: number) => `+9197${String(parseInt(run.slice(0, 6), 16) % 1e6).padStart(6, '0')}${String(n).padStart(2, '0')}`;
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, o = org.A.id) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const login = async (who: Who, k: 'A' | 'B') => (token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@esm3-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken);
  /** A provider post to a line, signed our way (dev transport and SMS gateways). */
  const hook = (line: string, body: object, o: { secret?: string; ts?: number; path?: string } = {}) => {
    const raw = JSON.stringify(body);
    const ts = String(o.ts ?? Math.floor(Date.now() / 1000));
    return request(app.getHttpServer())
      .post(`/api/v1${o.path ?? lines[line].path}`)
      .set('content-type', 'application/json')
      .set('x-yukthix-timestamp', ts)
      .set('x-yukthix-signature', signYukthix(o.secret ?? lines[line].secret, ts, Buffer.from(raw)))
      .send(raw);
  };
  const msg = (from: string, text: string, id = `m-${randomUUID()}`) => ({ id, from, text, at: Date.now() });
  const sentTo = (to: string) => fake.sent.filter((x) => x.to === to);
  const until = async <T>(fn: () => Promise<T | null | undefined> | T | null | undefined, what: string, ms = 15_000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    mountInboundMsgBody(app);
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    messaging = moduleRef.get(MessagingService);
    fake = messaging.transport as FakeMsgTransport;
    cards = moduleRef.get(ApprovalCards).transport as FakeChannelTransport;
    mailSync = moduleRef.get(MailboxSyncService);

    const planId = (await prisma.plan.create({ data: { name: `esm3-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    ids.plan = planId;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ESM3 Org ${k}`, slug: `esm3-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, keys: string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `p-${run}-${randomUUID().slice(0, 6)}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', tpl('desk_agent')],
      ['lead', 'A', 'panel', tpl('desk_lead')],
      ['emp', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
      ['agentB', 'B', 'panel', tpl('desk_agent')],
      ['netAg', 'A', 'panel', tpl('desk_agent')],
      ['plainAg', 'A', 'panel', tpl('desk_agent')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@esm3-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      await login(who, k);
    }
    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.itB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role, skills] of [['agent', 'agent', []], ['lead', 'lead', []], ['netAg', 'agent', ['network']], ['plainAg', 'agent', []]] as const) await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users[who], role, skills }).expect(201);
    await api('adminB', 'post', `/desk/desks/${ids.itB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    // The desk's lines (the webhook address and secret are shown once).
    for (const [k, desk, who, templates] of [
      ['whatsapp', ids.it, 'adminA', { reply_notice: { name: 'desk_reply_notice', language: 'en', status: 'approved' } }],
      ['sms', ids.it, 'adminA', { reply_notice: { dltTemplateId: '1107000000000000101', body: 'New reply on {#var#}: {#var#} -KAVERI', status: 'approved' } }],
      ['teams', ids.it, 'adminA', {}],
      ['whatsappB', ids.itB, 'adminB', {}],
      ['teamsB', ids.itB, 'adminB', {}],
    ] as const) {
      const kind = k.replace(/B$/, '');
      const r = (await api(who, 'post', `/desk/desks/${desk}/msg-channels`).send({ kind, name: `${k} line`, templates }).expect(201)).body;
      lines[k] = { path: new URL(r.webhookUrl).pathname.replace('/api/v1', ''), secret: r.secret, id: r.id };
    }
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: ids.plan } }).catch(() => undefined);
    await app.close();
  });

  it('every new table has forced RLS and the tenant policy', async () => {
    const tables = ['sd_msg_channels', 'sd_msg_identities', 'sd_widgets', 'sd_agent_presence_log', 'sd_agent_capacity', 'sd_shifts', 'sd_agent_mailboxes', 'sd_agent_drafts'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
  });

  // ------------------------------------------------------------------------------------------ webhooks

  describe('webhook signatures and replay (§14.4)', () => {
    it('unsigned, wrongly signed, too old, or another company’s path: the same bare 401', async () => {
      const body = JSON.stringify(msg(phone(1), 'hello'));
      await request(app.getHttpServer()).post(`/api/v1${lines.whatsapp.path}`).set('content-type', 'application/json').send(body).expect(401);
      await hook('whatsapp', msg(phone(1), 'hello'), { secret: 'not-the-secret-0000000000000000' }).expect(401);
      await hook('whatsapp', msg(phone(1), 'hello'), { ts: Math.floor(Date.now() / 1000) - 600 }).expect(401);
      // Company B's token under company A's path (and the other way round).
      const tokenB = lines.whatsappB.path.split('/').pop();
      await hook('whatsappB', msg(phone(1), 'hello'), { path: `/desk/inbound/msg/${org.A.id}/${tokenB}` }).expect(401);
      // The shared paths are refused without YukthiX's secrets (not set here); Teams has no shared path until go-live.
      await hook('whatsapp', msg(phone(1), 'hello'), { path: '/desk/inbound/msg/shared/sms' }).expect(401);
      await hook('whatsapp', msg(phone(1), 'hello'), { path: '/desk/inbound/msg/shared/teams' }).expect(401);
      await hook('whatsapp', msg(phone(1), 'hello'), { path: '/desk/inbound/msg/shared/fax' }).expect(404);
    });

    it('a sender nobody linked gets nothing back and nothing is made', async () => {
      const before = fake.sent.length;
      expect((await hook('whatsapp', msg(phone(2), 'Please help')).expect(200)).body).toEqual({ ok: true, taken: 0 });
      expect(fake.sent.length).toBe(before);
      expect(await system((tx) => tx.sdTicket.count({ where: { deskId: ids.it, channel: 'whatsapp' } }))).toBe(0);
    });
  });

  // ------------------------------------------------------------------------------------------ WhatsApp

  describe('WhatsApp: link, write, reply, stop', () => {
    it('JOIN <code> from the phone links it with an opt-in record; the code works once and only for its company', async () => {
      const { code, text } = (await api('emp', 'post', '/desk/my/messaging/join').send({ kind: 'whatsapp' }).expect(200)).body;
      expect(text).toBe(`JOIN ${code}`);
      // Company B's own line never takes company A's code.
      expect((await hook('whatsappB', msg(phone(3), `JOIN ${code}`)).expect(200)).body.taken).toBe(0);
      expect((await hook('whatsapp', msg(phone(3), `join ${code}`)).expect(200)).body.taken).toBe(1);
      expect(sentTo(phone(3)).at(-1)?.text).toMatch(/Your phone is linked/);
      // Used once.
      expect((await hook('whatsapp', msg(phone(4), `JOIN ${code}`)).expect(200)).body.taken).toBe(0);
      const consent = await system((tx) => tx.channelConsent.findFirstOrThrow({ where: { recipientId: users.emp, channel: 'whatsapp', withdrawnAt: null } }));
      expect(consent).toMatchObject({ source: 'whatsapp_join', scope: 'all_service', addressMasked: expect.stringMatching(/^\+91•+\d{2}$/) });
      const mine = (await api('emp', 'get', '/desk/my/messaging').expect(200)).body;
      expect(mine.lines.find((l: { kind: string }) => l.kind === 'whatsapp').linked.masked).toMatch(/•/);
      // The phone row is the person's own: an agent of the desk does not read it (RLS), even with the right ids.
      const seen = await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: users.agent }, (tx) => tx.sdMsgIdentity.count({ where: { userId: users.emp } }));
      expect(seen).toBe(0);
    });

    it('a message makes a request on the line’s desk; the next one adds to it; a replayed id is taken once', async () => {
      const first = msg(phone(3), 'My laptop will not start');
      expect((await hook('whatsapp', first).expect(200)).body.taken).toBe(1);
      const t = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { deskId: ids.it, channel: 'whatsapp' } }));
      expect(t).toMatchObject({ subject: 'My laptop will not start', channel: 'whatsapp' });
      ids.waTicket = t.id;
      ids.waNumber = t.number;
      expect(sentTo(phone(3)).at(-1)?.text).toContain(`We made request ${t.number}`);
      expect((await hook('whatsapp', first).expect(200)).body.taken).toBe(0);
      await hook('whatsapp', msg(phone(3), 'It shows a blue screen')).expect(200);
      const msgs = await system((tx) => tx.sdTicketMessage.findMany({ where: { ticketId: t.id, side: 'requester' }, orderBy: { createdAt: 'asc' } }));
      expect(msgs.map((m) => [m.channel, m.bodyText])).toEqual([['whatsapp', 'My laptop will not start'], ['whatsapp', 'It shows a blue screen']]);
      expect(await system((tx) => tx.sdTicket.count({ where: { deskId: ids.it, channel: 'whatsapp' } }))).toBe(1);
    });

    it('the agent’s reply reaches the phone (inside 24 hours, the words); a private ticket says only that there is a reply', async () => {
      await api('agent', 'post', `/desk/tickets/${ids.waTicket}/messages`).send({ kind: 'reply', bodyHtml: '<p>Hold the power button for 10 seconds.</p>' }).expect(201);
      const got = await until(() => sentTo(phone(3)).find((x) => x.text.includes('Hold the power button')), 'the WhatsApp reply');
      expect(got).toMatchObject({ kind: 'whatsapp', template: null, text: expect.stringContaining(`replied on ${ids.waNumber}`) });
      const v = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.waTicket } }))).version;
      await api('agent', 'patch', `/desk/tickets/${ids.waTicket}`).send({ version: v, private: true }).expect(200);
      await api('agent', 'post', `/desk/tickets/${ids.waTicket}/messages`).send({ kind: 'reply', bodyHtml: '<p>Your salary record shows the laptop deduction.</p>' }).expect(201);
      const neutral = await until(() => sentTo(phone(3)).find((x) => x.text.startsWith(`There is a new reply on your request ${ids.waNumber}`)), 'the neutral notice');
      expect(neutral.text).not.toMatch(/salary/);
      expect(fake.sent.some((x) => x.text.includes('salary'))).toBe(false);
      const log = await system((tx) => tx.notificationDelivery.findMany({ where: { organizationId: org.A.id, channel: 'whatsapp', kind: 'desk_reply' } }));
      expect(log.every((d) => d.status === 'sent' && /•/.test(d.addressMasked))).toBe(true);
    });

    it('outside 24 hours only the approved template goes, never the words', async () => {
      await system((tx) => tx.sdMsgIdentity.updateMany({ where: { userId: users.emp, kind: 'whatsapp' }, data: { lastInboundAt: new Date(Date.now() - 30 * 3_600_000) } }));
      const v = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.waTicket } }))).version;
      await api('lead', 'patch', `/desk/tickets/${ids.waTicket}`).send({ version: v, private: false }).expect(200);
      await api('agent', 'post', `/desk/tickets/${ids.waTicket}/messages`).send({ kind: 'reply', bodyHtml: '<p>Bring it to the IT room tomorrow.</p>' }).expect(201);
      const tpl = await until(() => sentTo(phone(3)).find((x) => x.template === 'desk_reply_notice'), 'the template');
      expect(tpl.text).not.toMatch(/IT room/);
    });

    it('STOP withdraws the opt-in at once (one confirmation, then nothing); START brings it back', async () => {
      await hook('whatsapp', msg(phone(3), 'STOP')).expect(200);
      expect(sentTo(phone(3)).at(-1)?.text).toMatch(/no more messages/);
      const c = await system((tx) => tx.channelConsent.findFirstOrThrow({ where: { recipientId: users.emp, channel: 'whatsapp', source: 'whatsapp_join' } }));
      expect(c).toMatchObject({ withdrawalSource: 'stop_keyword' });
      expect(c.withdrawnAt).not.toBeNull();
      const before = sentTo(phone(3)).length;
      await api('agent', 'post', `/desk/tickets/${ids.waTicket}/messages`).send({ kind: 'reply', bodyHtml: '<p>Are you there?</p>' }).expect(201);
      await new Promise((r) => setTimeout(r, 3000));
      expect(sentTo(phone(3)).length).toBe(before);
      // A stopped phone's messages make nothing.
      expect((await hook('whatsapp', msg(phone(3), 'hello again')).expect(200)).body.taken).toBe(0);
      expect((await hook('whatsapp', msg(phone(3), 'START')).expect(200)).body.taken).toBe(1);
      expect(sentTo(phone(3)).at(-1)?.text).toMatch(/Messages are on again/);
      expect(await system((tx) => tx.channelConsent.count({ where: { recipientId: users.emp, channel: 'whatsapp', withdrawnAt: null, source: 'whatsapp_start' } }))).toBe(1);
    });

    it('a per-sender limit drops a flood (per company and per sender, §14.4)', async () => {
      let taken = 0;
      for (let i = 0; i < 24; i++) taken += (await hook('whatsapp', msg(phone(3), `flood ${i}`)).expect(200)).body.taken;
      expect(taken).toBeLessThanOrEqual(20);
    });
  });

  // ------------------------------------------------------------------------------------------ SMS

  it('two-way SMS: the reply goes back as the registered template with the start of the words (DLT 30 characters)', async () => {
    const { code } = (await api('other', 'post', '/desk/my/messaging/join').send({ kind: 'sms' }).expect(200)).body;
    await hook('sms', msg(phone(5), `JOIN ${code}`)).expect(200);
    await hook('sms', msg(phone(5), 'Printer on 3rd floor is out of toner')).expect(200);
    const t = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { deskId: ids.it, channel: 'sms' } }));
    await api('agent', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>A new cartridge is on its way to your floor this afternoon.</p>' }).expect(201);
    const s = await until(() => sentTo(phone(5)).find((x) => x.template === '1107000000000000101'), 'the SMS template');
    expect(s.text).toBe(`New reply on ${t.number}: A new cartridge is on its way… -KAVERI`);
  });

  // ------------------------------------------------------------------------------------------ Teams

  describe('Teams: requesters and agents in chat (US-B-134, US-G-057)', () => {
    it('a linked requester raises a request in Teams and hears the reply there; an agent claims and replies by command', async () => {
      await api('emp', 'post', '/workflow/channel-links').send({ provider: 'teams', externalRef: `aad-emp-${run}` }).expect(201);
      await api('agent', 'post', '/workflow/channel-links').send({ provider: 'teams', externalRef: `aad-agent-${run}` }).expect(201);
      await hook('teams', msg(`aad-emp-${run}`, 'Need access to the Sales drive')).expect(200);
      const t = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { deskId: ids.it, channel: 'teams' } }));
      await hook('teams', msg(`aad-agent-${run}`, `claim ${t.number}`)).expect(200);
      expect(sentTo(`aad-agent-${run}`).at(-1)?.text).toBe(`${t.number} is yours now.`);
      await hook('teams', msg(`aad-agent-${run}`, `reply ${t.number} Done, please sign in again`)).expect(200);
      await until(() => sentTo(`aad-emp-${run}`).find((x) => x.text.includes('Done, please sign in again')), 'the Teams reply');
      const row = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }));
      expect(row.assigneeUserId).toBe(users.agent);
      await hook('teams', msg(`aad-agent-${run}`, 'tickets')).expect(200);
      expect(sentTo(`aad-agent-${run}`).at(-1)?.text).toContain(t.number);
      ids.teamsNumber = t.number;
    });

    it('an agent of another company cannot reach the ticket from their chat app', async () => {
      await api('agentB', 'post', '/workflow/channel-links').send({ provider: 'teams', externalRef: `aad-agentb-${run}` }).expect(201);
      await hook('teamsB', msg(`aad-agentb-${run}`, `view ${ids.teamsNumber}`)).expect(200);
      expect(sentTo(`aad-agentb-${run}`).at(-1)?.text).toBe(`No ticket ${ids.teamsNumber} that you work on.`);
      // And company A's line ignores B's people.
      expect((await hook('teams', msg(`aad-agentb-${run}`, 'tickets')).expect(200)).body.taken).toBe(0);
    });
  });

  // ------------------------------------------------------------------------------------------ routing (SD-2.25)

  describe('presence, capacity, skill and language routing', () => {
    it('skills and language first; then capacity moves work on; busy agents get none; the reason is on the timeline', async () => {
      const grp = await system(async (tx) => {
        const g = await tx.sdGroup.create({ data: { organizationId: org.A.id, deskId: ids.it, name: 'Routing team', assignmentMethod: 'load' } });
        for (const u of [users.netAg, users.plainAg]) await tx.sdGroupMember.create({ data: { organizationId: org.A.id, deskId: ids.it, groupId: g.id, userId: u } });
        return g.id;
      });
      const cat = (await api('adminA', 'post', `/desk/desks/${ids.it}/categories`).send({ name: 'Network', skills: ['network'], defaultGroupId: grp }).expect(201)).body.id;
      await api('lead', 'put', `/desk/desks/${ids.it}/agents/${users.netAg}/routing`).send({ languages: ['hi', 'en'], capacity: { ticket: 1 } }).expect(200);
      // An agent cannot plan the team.
      await api('agent', 'put', `/desk/desks/${ids.it}/agents/${users.netAg}/routing`).send({ capacity: { ticket: 9 } }).expect(403);
      const raise = (subject: string) => api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, categoryId: cat, subject, description: 'The Wi-Fi drops.', language: 'hi' }).expect(201);
      const t1 = (await raise('Wi-Fi drops on floor 2')).body;
      const r1 = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t1.id } }));
      expect(r1).toMatchObject({ assigneeUserId: users.netAg, language: 'hi' });
      const ev = await system((tx) => tx.sdTicketEvent.findFirstOrThrow({ where: { ticketId: t1.id, kind: 'assigned' } }));
      expect(ev.reason).toBe('Routed by skills network and language hi; fewest open tickets');
      // netAg is at capacity (1 open): the next one goes to the other agent, and says why.
      const t2 = (await raise('Wi-Fi drops on floor 3')).body;
      expect((await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t2.id } }))).assigneeUserId).toBe(users.plainAg);
      // Busy agents get no pushed work; nobody free: the ticket waits and the timeline says so.
      await api('plainAg', 'put', '/desk/me/presence').send({ status: 'busy' }).expect(200);
      const t3 = (await raise('Wi-Fi drops on floor 4')).body;
      expect((await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t3.id } }))).assigneeUserId).toBeNull();
      expect((await system((tx) => tx.sdTicketEvent.findFirstOrThrow({ where: { ticketId: t3.id, kind: 'routing' } }))).reason).toMatch(/waiting in the team queue/);
      // Presence history for the report; the lead sees the team live.
      expect(await system((tx) => tx.sdAgentPresenceLog.count({ where: { userId: users.plainAg, status: 'busy', endedAt: null } }))).toBe(1);
      const team = (await api('lead', 'get', `/desk/desks/${ids.it}/team`).expect(200)).body;
      expect(team.find((m: { userId: string }) => m.userId === users.plainAg)).toMatchObject({ presence: 'busy', openTickets: 1 });
      expect(team.find((m: { userId: string }) => m.userId === users.netAg)).toMatchObject({ capacity: { ticket: 1, chat: null, messaging: null }, languages: ['hi', 'en'], skills: ['network'] });
      await api('plainAg', 'put', '/desk/me/presence').send({ status: 'available' }).expect(200);
    });
  });

  // ------------------------------------------------------------------------------------------ shifts and forecast (SD-2.26)

  describe('shifts, forecast and reports', () => {
    it('a lead plans shifts (no overlaps, CSV all or nothing); other companies see nothing', async () => {
      const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      await api('lead', 'post', `/desk/desks/${ids.it}/shifts`).send({ userId: users.agent, startsAt: `${day}T03:30:00Z`, endsAt: `${day}T11:30:00Z` }).expect(201);
      await api('lead', 'post', `/desk/desks/${ids.it}/shifts`).send({ userId: users.agent, startsAt: `${day}T10:00:00Z`, endsAt: `${day}T12:00:00Z` }).expect(409);
      await api('agent', 'post', `/desk/desks/${ids.it}/shifts`).send({ userId: users.agent, startsAt: `${day}T13:00:00Z`, endsAt: `${day}T15:00:00Z` }).expect(403);
      const bad = (await api('lead', 'post', `/desk/desks/${ids.it}/shifts/import`).send({ csv: `email,start,end\nnetAg@esm3-${run}.test,${day} 09:00,${day} 17:00\nnobody@x.test,${day} 09:00,${day} 17:00` }).expect(400)).body;
      expect(bad.problems).toEqual(['Line 2: no colleague with that email.']);
      expect(await system((tx) => tx.sdShift.count({ where: { userId: users.netAg } }))).toBe(0);
      expect((await api('lead', 'post', `/desk/desks/${ids.it}/shifts/import`).send({ csv: `netAg@esm3-${run}.test,${day} 09:00,${day} 17:00,Day` }).expect(200)).body).toEqual({ added: 1 });
      const list = (await api('lead', 'get', `/desk/desks/${ids.it}/shifts?from=${day}&to=${day}`).expect(200)).body;
      expect(list.length).toBeGreaterThanOrEqual(1);
      await api('agentB', 'get', `/desk/desks/${ids.it}/shifts?from=${day}&to=${day}`).expect(404);
    });

    it('the forecast is the same-weekday average of 8 weeks of history, beside who is rostered', async () => {
      const today = new Date(Date.now() + 330 * 60_000);
      await system((tx) =>
        tx.sdKpiDaily.createMany({
          data: Array.from({ length: 56 }, (_, i) => {
            const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 56 + i));
            return { organizationId: org.A.id, deskId: ids.it, day: d, metric: 'created', value: d.getUTCDay() === 1 ? 40 : 10 };
          }),
          skipDuplicates: true,
        }),
      );
      const f = (await api('lead', 'get', `/desk/desks/${ids.it}/forecast?days=7&perAgent=20`).expect(200)).body;
      expect(f.days).toHaveLength(7);
      const monday = f.days.find((d: { weekday: number }) => d.weekday === 1);
      expect(monday).toMatchObject({ expected: 40, staffNeeded: 2, basis: 8 });
      expect(f.days.find((d: { weekday: number }) => d.weekday === 3)).toMatchObject({ expected: 10, staffNeeded: 1 });
      // Without the report view the guard stops it; a lead of another company never reaches this desk.
      await api('agentB', 'get', `/desk/desks/${ids.it}/forecast`).expect(403);
      const day = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
      const rep = (await api('lead', 'get', `/desk/desks/${ids.it}/availability?from=${day}&to=${day}`).expect(200)).body;
      expect(rep.find((r: { userId: string }) => r.userId === users.agent)).toMatchObject({ replies: expect.any(Number), minutes: expect.any(Object) });
      expect(rep.find((r: { userId: string }) => r.userId === users.agent).replies).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------------------------------ widget (SD-2.20)

  describe('help widget sign-in', () => {
    const jwt = new JwtService({});
    it('a token signed by the company opens a portal session once; forged, replayed, long-lived or off-site tokens do not', async () => {
      const portal = await system(async (tx) => {
        const p = await tx.sdPortal.create({ data: { organizationId: org.A.id, slug: 'help', name: 'Help' } });
        await tx.sdPortalDesk.create({ data: { organizationId: org.A.id, portalId: p.id, deskId: ids.it } });
        return p;
      });
      await api('agent', 'post', '/desk/widgets').send({ portalId: portal.id, name: 'Shop', allowedOrigins: ['https://shop.example.com'] }).expect(403);
      await api('adminA', 'post', '/desk/widgets').send({ portalId: portal.id, name: 'Shop', allowedOrigins: ['https://shop.example.com/help'] }).expect(400);
      const w = (await api('adminA', 'post', '/desk/widgets').send({ portalId: portal.id, name: 'Shop', allowedOrigins: ['https://shop.example.com'] }).expect(201)).body;
      expect(w.snippet).toBe(`<script src="${(process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '')}/yx-widget.js" data-key="${w.key}" async></script>`);
      const cfg = (await request(app.getHttpServer()).get(`/api/v1/desk/widget/${w.key}`).expect(200)).body;
      expect(cfg).toMatchObject({ orgSlug: org.A.slug, portalSlug: 'help', allowedOrigins: ['https://shop.example.com'] });
      const sign = (claims: object, secret = w.secret, o: object = {}) => jwt.sign({ email: `asha-${run}@customer.test`, name: 'Asha', jti: randomUUID(), ...claims }, { secret, algorithm: 'HS256', audience: w.key, expiresIn: 300, ...o });
      const web = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
      const session = (tokenValue: string, origin: string | null, parentOrigin?: string) => {
        const r = request(app.getHttpServer()).post(`/api/v1/desk/widget/${w.key}/session`);
        if (origin) r.set('Origin', origin);
        return r.send({ token: tokenValue, ...(parentOrigin ? { parentOrigin } : {}) });
      };
      const good = sign({});
      const s = (await session(good, web, 'https://shop.example.com').expect(200)).body;
      expect(s).toMatchObject({ orgSlug: org.A.slug, portalSlug: 'help' });
      await request(app.getHttpServer()).get(`/api/v1/desk/portal/${org.A.slug}/help/tickets`).set('X-Portal-Session', s.token).expect(200);
      // The same token again, a forged one, another site, a mobile call on a web-only widget, a long-lived token.
      await session(good, web, 'https://shop.example.com').expect(401);
      await session(sign({}, 'x'.repeat(43)), web, 'https://shop.example.com').expect(401);
      await session(sign({}), web, 'https://evil.example.com').expect(401);
      await session(sign({}), 'https://evil.example.com').expect(401);
      await session(sign({}), 'null').expect(401);
      await session(sign({}), null).expect(401);
      await session(sign({}, w.secret, { expiresIn: 3600 }), web, 'https://shop.example.com').expect(401);
      await session(sign({ jti: undefined }), web, 'https://shop.example.com').expect(401);
      // A colleague never signs in through a widget.
      await session(sign({ email: `emp@esm3-${run}.test` }), web, 'https://shop.example.com').expect(401);
      // Mobile SDKs work once the widget is marked mobile.
      await api('adminA', 'patch', `/desk/widgets/${w.id}`).send({ version: w.version, mobile: true }).expect(200);
      await session(sign({}), null).expect(200);
      // Company B never sees A's widget.
      expect((await api('adminB', 'get', '/desk/widgets').expect(200)).body).toEqual([]);
    });
  });

  // ------------------------------------------------------------------------------------------ mailbox sync (SD-2.24)

  it('an agent’s mailbox brings in matched threads only, once, on tickets they work; unlinking stops it', async () => {
    const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'VPN token expired', description: 'Cannot sign in to VPN.' }).expect(201)).body;
    const reply = (await api('agent', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>I reset it.</p>' }).expect(201)).body;
    await system((tx) => tx.sdTicketMessage.update({ where: { id: reply.id }, data: { emailMessageId: `<sd.${run}@desk.test>` } }));
    const box = (await api('agent', 'post', '/desk/me/mailbox').send({ kind: 'dev' }).expect(201)).body;
    expect(box.address).toBe(`agent@esm3-${run}.test`);
    const mail = (id: string, inReplyTo: string | null, body: string) => Buffer.from(`Message-ID: <${id}@mail.test>\r\nFrom: emp@esm3-${run}.test\r\nTo: agent@esm3-${run}.test\r\nSubject: Re: VPN\r\n${inReplyTo ? `In-Reply-To: ${inReplyTo}\r\n` : ''}Content-Type: text/plain\r\n\r\n${body}\r\n`);
    DevMailboxPoller.inbox.set(box.id, [mail(`a-${run}`, `<sd.${run}@desk.test>`, 'Works now, thanks'), mail(`b-${run}`, null, 'Lunch on Friday?')]);
    expect(await mailSync.syncOne(org.A.id, box.id)).toBe(1);
    const notes = await system((tx) => tx.sdTicketMessage.findMany({ where: { ticketId: t.id, kind: 'note', channel: 'email' } }));
    expect(notes).toHaveLength(1);
    expect(notes[0].bodyText).toContain('Works now, thanks');
    expect(await system((tx) => tx.sdTicketMessage.count({ where: { organizationId: org.A.id, bodyText: { contains: 'Lunch on Friday' } } }))).toBe(0);
    // A second agent's mailbox with the same thread: still one note.
    const box2 = (await api('lead', 'post', '/desk/me/mailbox').send({ kind: 'dev' }).expect(201)).body;
    DevMailboxPoller.inbox.set(box2.id, [mail(`a-${run}`, `<sd.${run}@desk.test>`, 'Works now, thanks')]);
    expect(await mailSync.syncOne(org.A.id, box2.id)).toBe(0);
    // Only the owner sees the mailbox row; unlinking wipes the grant and stops at once.
    expect(await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false, userId: users.lead }, (tx) => tx.sdAgentMailbox.count({ where: { id: box.id } }))).toBe(0);
    await api('agent', 'delete', '/desk/me/mailbox').expect(200);
    DevMailboxPoller.inbox.set(box.id, [mail(`c-${run}`, `<sd.${run}@desk.test>`, 'One more thing')]);
    expect(await mailSync.syncOne(org.A.id, box.id)).toBe(0);
    expect(await system((tx) => tx.sdAgentMailbox.findFirstOrThrow({ where: { id: box.id } }))).toMatchObject({ status: 'unlinked', configEncrypted: null });
    // Someone without an agent seat cannot link one.
    await api('emp', 'post', '/desk/me/mailbox').send({ kind: 'dev' }).expect(403);
  });

  // ------------------------------------------------------------------------------------------ mobile (SD-2.27)

  it('phone drafts: two devices conflict on the draft; a changed ticket stops the send until the agent forces it', async () => {
    const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Monitor flickers', description: 'Since today.' }).expect(201)).body;
    const row = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }));
    const ref = `draft-${run}`;
    const d1 = (await api('agent', 'put', `/desk/mobile/drafts/${ref}`).send({ ticketId: t.id, kind: 'reply', bodyHtml: '<p>Try another cable</p>', baseTicketVersion: row.version }).expect(200)).body;
    expect(d1.version).toBe(1);
    await api('agent', 'put', `/desk/mobile/drafts/${ref}`).send({ ticketId: t.id, kind: 'reply', bodyHtml: '<p>Try another cable, please</p>', baseTicketVersion: row.version, version: 1 }).expect(200);
    // The other device still has version 1.
    expect((await api('agent', 'put', `/desk/mobile/drafts/${ref}`).send({ ticketId: t.id, kind: 'reply', bodyHtml: '<p>old</p>', baseTicketVersion: row.version, version: 1 }).expect(409)).body.code).toBe('DRAFT_CHANGED');
    // Another person never sees it.
    expect((await api('lead', 'get', '/desk/mobile/drafts').expect(200)).body).toEqual([]);
    // The requester writes meanwhile: the send is stopped with what is new.
    await api('emp', 'post', `/desk/my/tickets/${t.id}/messages`).send({ text: 'It stopped by itself.' }).expect(201);
    const stop = (await api('agent', 'post', `/desk/mobile/drafts/${ref}/send`).send({}).expect(409)).body;
    expect(stop).toMatchObject({ code: 'TICKET_CHANGED', newMessages: [expect.objectContaining({ side: 'requester', text: 'It stopped by itself.' })] });
    await api('agent', 'post', `/desk/mobile/drafts/${ref}/send`).send({ force: true }).expect(200);
    expect(await system((tx) => tx.sdTicketMessage.count({ where: { ticketId: t.id, side: 'agent', bodyText: { contains: 'Try another cable, please' } } }))).toBe(1);
    expect((await api('agent', 'get', '/desk/mobile/drafts').expect(200)).body).toEqual([]);
    await api('agent', 'post', `/desk/mobile/drafts/${ref}/send`).send({}).expect(404);
    const home = (await api('lead', 'get', '/desk/mobile/home').expect(200)).body;
    expect(home).toMatchObject({ myOpen: expect.any(Number), unassigned: expect.any(Number), desks: [expect.objectContaining({ deskId: ids.it })] });
    const q = (await api('agent', 'get', '/desk/mobile/queue?scope=mine').expect(200)).body;
    expect(q[0]).not.toHaveProperty('bodyText');
    await api('emp', 'get', '/desk/mobile/home').expect(403);
  });

  it('an SLA warning reaches the owner’s linked phone with the number only', async () => {
    await api('agent', 'post', '/workflow/channel-links').send({ provider: 'push', externalRef: `push-agent-${run}` }).expect(201);
    const t = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.waTicket } }));
    await system((tx) => tx.sdTicket.update({ where: { id: t.id }, data: { assigneeUserId: users.agent } }));
    const before = cards.sent.length;
    await (messaging as unknown as { slaPush: (o: string, t: string, b: boolean, e: string) => Promise<void> }).slaPush(org.A.id, t.id, false, `ev-${run}`);
    await (messaging as unknown as { slaPush: (o: string, t: string, b: boolean, e: string) => Promise<void> }).slaPush(org.A.id, t.id, false, `ev-${run}`);
    const pushes = cards.sent.slice(before);
    expect(pushes).toHaveLength(1);
    expect(JSON.stringify(pushes[0].payload)).toContain(t.number);
    expect(JSON.stringify(pushes[0].payload)).not.toContain(t.subject);
  });

  // ------------------------------------------------------------------------------------------ founder decision (b)

  it('the HR starter pack on an existing standard HR desk asks first, showing what changes', async () => {
    const hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    await system((tx) => tx.sdDesk.update({ where: { id: hr }, data: { privacy: 'standard' } }));
    const ask = (await api('adminA', 'post', `/desk/desks/${hr}/starter-pack`).send({}).expect(409)).body;
    expect(ask.code).toBe('CONFIRM_RESTRICT');
    expect(ask.changes.join(' ')).toMatch(/Only the 0 agents of this desk will see its tickets/);
    expect((await system((tx) => tx.sdDesk.findFirstOrThrow({ where: { id: hr } }))).privacy).toBe('standard');
    expect((await api('adminA', 'post', `/desk/desks/${hr}/starter-pack`).send({ restrict: false }).expect(200)).body.restricted).toBe(false);
    expect((await system((tx) => tx.sdDesk.findFirstOrThrow({ where: { id: hr } }))).privacy).toBe('standard');
    expect((await api('adminA', 'post', `/desk/desks/${hr}/starter-pack`).send({ restrict: true }).expect(200)).body.restricted).toBe(true);
    expect((await system((tx) => tx.sdDesk.findFirstOrThrow({ where: { id: hr } }))).privacy).toBe('restricted');
    expect(await system((tx) => tx.auditLog.count({ where: { action: 'desk.desk.restricted', entityId: hr } }))).toBe(1);
  });
});
