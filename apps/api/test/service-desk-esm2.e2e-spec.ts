process.env.SD_SCANNER = 'dev-fake';
process.env.APPROVAL_CHANNELS = 'dev-fake';
process.env.REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/11';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { io, Socket } from 'socket.io-client';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { AutomationService } from '../src/rules-engine/automation.service';
import { ApprovalCards, FakeChannelTransport } from '../src/workflow/approval-channels';
import { ChatGateway } from '../src/service-desk/chat.gateway';
import { ChatIoAdapter } from '../src/service-desk/chat-io.adapter';
import { ChatService } from '../src/service-desk/chat.service';
import { RecurringService } from '../src/service-desk/recurring.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// M14 Service Desk phase 3b-2 batch 2 end to end, against the real database (forced RLS, the visibility policies, the
// app role), Redis (db 11) and a listening socket.io server with the Redis adapter: approval cards with single-use links
// and neutral sensitive cards (SD-2.06), documents signed in the app (SD-2.07), joiner journeys from M01 (SD-2.08),
// starter packs (SD-2.09), HR summary, share and move (SD-2.10), lifecycles (SD-2.11), recurring records and sequences
// (SD-2.13), interactions (SD-2.17), live chat with socket auth, MFA, session revoke, rooms kept per company, limits
// (SD-2.18, SD-2.19).
describe('Service Desk 3b-2 batch 2', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  let cards: FakeChannelTransport;
  let gateway: ChatGateway;
  let chat: ChatService;
  let recurring: RecurringService;
  let url = '';
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'hrAg' | 'mgr' | 'emp' | 'other' | 'empB' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const sockets: Socket[] = [];
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, o = org.A.id) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const login = async (who: Who, k: 'A' | 'B') => (token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@esm2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken);

  /** A socket for this person; resolves once connected, rejects when the server refuses it. */
  const connect = (who: Who) =>
    new Promise<Socket>((resolve, reject) => {
      const s = io(`${url}/desk-chat`, { auth: { token: token[who] }, transports: ['websocket'], forceNew: true, reconnection: false });
      sockets.push(s);
      const t = setTimeout(() => reject(new Error('no connect')), 8000);
      s.on('connect', () => setTimeout(() => (s.connected ? (clearTimeout(t), resolve(s)) : reject(new Error('kicked'))), 150));
      s.on('disconnect', () => {
        clearTimeout(t);
        reject(new Error('disconnected'));
      });
      s.on('connect_error', (e) => reject(e));
    });
  /** The 6-digit code in the newest email to this address (the one-time code is sent without waiting). */
  const codeSentTo = async (to: string) => {
    for (let i = 0; i < 40; i++) {
      const calls = (app.get(EmailService).send as jest.Mock).mock.calls as [{ to?: string; text?: string; html?: string }][];
      const hit = [...calls].reverse().find(([m]) => m.to === to && /\d{6}/.test(`${m.text ?? ''}`));
      if (hit) return /(\d{6})/.exec(hit[0].text ?? '')![1];
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`no code sent to ${to}`);
  };
  const ask = (s: Socket, event: string, body: unknown) => s.timeout(5000).emitWithAck(event, body) as Promise<Record<string, unknown>>;
  const next = (s: Socket, event: string) => new Promise<Record<string, unknown>>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${event}`)), 5000);
    s.once(event, (p: Record<string, unknown>) => (clearTimeout(t), resolve(p)));
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useWebSocketAdapter(new ChatIoAdapter(app, process.env.REDIS_URL));
    await app.listen(0, '127.0.0.1');
    url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    automation = moduleRef.get(AutomationService);
    cards = moduleRef.get(ApprovalCards).transport as FakeChannelTransport;
    gateway = moduleRef.get(ChatGateway);
    chat = moduleRef.get(ChatService);
    recurring = moduleRef.get(RecurringService);

    const planId = (await prisma.plan.create({ data: { name: `esm2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    ids.plan = planId;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ESM2 Org ${k}`, slug: `esm2-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, keys: string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `p-${run}-${randomUUID().slice(0, 6)}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', tpl('desk_agent')],
      // The lead also holds the HR view (company-wide) so the HR summary shows internal fields to them.
      ['lead', 'A', 'panel', [...tpl('desk_lead'), 'employee.profile.view', 'request.raise_on_behalf']],
      ['hrAg', 'A', 'panel', tpl('desk_agent')],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
      ['agentB', 'B', 'panel', tpl('desk_agent')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@esm2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      await login(who, k);
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'ESM2 Foods', shortName: `E2-${run}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const id = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id, name: 'ENG', code: 'ENG', path: `/${id}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENGR' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (given: string, userId: string | null, manager: string | null, joinedOn = today) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, joinedOn, ...(userId ? { userId, workEmail: `${given}@esm2-${run}.test` } : {}), assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', users.mgr, null);
    ids.empEmp = await hire('emp', users.emp, ids.mgrEmp);
    await hire('other', users.other, ids.mgrEmp);
    (globalThis as { __hire?: typeof hire }).__hire = hire;

    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    ids.itB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    for (const [who, desk, role] of [['agent', ids.it, 'agent'], ['lead', ids.it, 'lead'], ['hrAg', ids.hr, 'agent']] as const) await api('adminA', 'post', `/desk/desks/${desk}/members`).send({ userId: users[who], role }).expect(201);
    await api('adminB', 'post', `/desk/desks/${ids.itB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
    await system(async (tx) => {
      ids.itTeam = (await tx.sdGroup.findFirstOrThrow({ where: { deskId: ids.it } })).id;
      ids.catLaptop = (await tx.sdCategory.findFirstOrThrow({ where: { deskId: ids.it, name: 'Laptop and devices' } })).id;
      ids.catPay = (await tx.sdCategory.findFirstOrThrow({ where: { deskId: ids.hr, name: 'Payslip and pay' } })).id;
    });
  }, 240_000);

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
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
    const tables = ['channel_links', 'wf_action_tokens', 'sd_doc_templates', 'sd_request_documents', 'sd_journeys', 'sd_journey_runs', 'sd_ticket_shares', 'sd_desk_branches', 'sd_lifecycles', 'sd_lifecycle_versions', 'sd_recurring', 'sd_recurring_runs', 'sd_sequences', 'sd_sequence_runs', 'sd_interactions', 'sd_chat_queues', 'sd_chat_sessions', 'sd_chat_files', 'sd_chat_messages'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[]) AND c.relkind = 'r'`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
  });

  // ------------------------------------------------------------------------------------------ SD-2.09 starter packs

  it('a new HR desk is restricted, its pay, medical and personal categories make tickets private, and it has its pack', async () => {
    const hr = await system((tx) => tx.sdDesk.findFirstOrThrow({ where: { id: ids.hr } }));
    expect(hr.privacy).toBe('restricted');
    const cats = await system((tx) => tx.sdCategory.findMany({ where: { deskId: ids.hr, privateByDefault: true }, select: { name: true } }));
    expect(cats.map((c) => c.name).sort()).toEqual(['Medical and insurance', 'Payslip and pay', 'Personal matter']);
    const items = await system((tx) => tx.sdCatalogItem.findMany({ where: { deskId: ids.hr }, select: { name: true, journeyOnly: true } }));
    expect(items.find((i) => i.name === 'Exit settlement')?.journeyOnly).toBe(true);
    expect((await system((tx) => tx.sdSlaPolicy.count({ where: { deskId: ids.hr } })))).toBe(1);
    // Installing again adds nothing; journey-only items never show in the catalogue.
    expect((await api('adminA', 'post', `/desk/desks/${ids.hr}/starter-pack`).expect(200)).body).toEqual({ items: 0, sla: false, restricted: true });
    const catalogue = (await api('emp', 'get', '/desk/my/catalog').expect(200)).body.items.map((i: { name: string }) => i.name);
    expect(catalogue).toContain('Employment letter');
    expect(catalogue).not.toContain('Exit settlement');
    // A payslip question is private and sensitive at once.
    const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.hr, categoryId: ids.catPay, subject: 'My pay is short', description: 'This month is short.' }).expect(201)).body;
    const row = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }));
    expect(row).toMatchObject({ sensitive: true, private: true });
    ids.payTicket = t.id;
  });

  // ------------------------------------------------------------------------------------------ SD-2.06 approval cards

  describe('approve from a card', () => {
    it('cards go only to linked people; the link is single use, never decided by opening it, and shows the summary', async () => {
      await api('mgr', 'post', '/workflow/channel-links').send({ provider: 'teams', externalRef: `aad-mgr-${run}` }).expect(201);
      // Someone else cannot take that account.
      await api('other', 'post', '/workflow/channel-links').send({ provider: 'teams', externalRef: `aad-mgr-${run}` }).expect(409);
      const item = (await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Mouse', categoryId: ids.catLaptop, draft: { approval: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any' }], fulfilment: [{ title: 'Hand over a mouse', groupId: ids.itTeam }] } }).expect(201)).body;
      await api('adminA', 'post', `/desk/catalog/admin/items/${item.id}/publish`).send({ version: item.version }).expect(200);
      const before = cards.sent.length;
      await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: item.id, answers: {} }] }).expect(201);
      const sent = cards.sent.slice(before);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ provider: 'teams', externalRef: `aad-mgr-${run}` });
      const body = JSON.stringify(sent[0].payload);
      expect(body).toContain(`Mouse for emp ${run}`);
      const link = body.match(/\/yx\/act\/([A-Za-z0-9._-]+)/)![1];
      // Opening (a chat app previews links) decides nothing.
      const view = (await request(app.getHttpServer()).get(`/api/v1/workflow/act/${link}`).expect(200)).body;
      expect(view).toMatchObject({ state: 'open', title: `Mouse for emp ${run}` });
      expect((await request(app.getHttpServer()).get(`/api/v1/workflow/act/${link}`).expect(200)).body.state).toBe('open');
      await request(app.getHttpServer()).post(`/api/v1/workflow/act/${link}`).send({ decision: 'reject' }).expect(409);
      await request(app.getHttpServer()).post(`/api/v1/workflow/act/${link}x`).send({ decision: 'approve' }).expect(404);
      const done = (await request(app.getHttpServer()).post(`/api/v1/workflow/act/${link}`).send({ decision: 'approve' }).expect(200)).body;
      expect(done.status).toBe('approved');
      // Single use, even after the request moved on.
      expect((await request(app.getHttpServer()).post(`/api/v1/workflow/act/${link}`).send({ decision: 'approve' }).expect(410)).body.code).toBe('LINK_USED');
      const log = await system((tx) => tx.wfAction.findFirstOrThrow({ where: { actorUserId: users.mgr, action: 'approved' }, orderBy: { createdAt: 'desc' } }));
      expect(log.channel).toBe('teams');
    });

    it('an expired link is refused', async () => {
      const t = await system((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users.mgr } }));
      const { token: link } = await system((tx) => (app.get(ApprovalCards) as ApprovalCards).mint(tx, org.A.id, t.id, users.mgr, 'teams'));
      await system((tx) => tx.wfActionToken.updateMany({ where: { taskId: t.id, usedAt: null }, data: { expiresAt: new Date(Date.now() - 1000) } }));
      expect((await request(app.getHttpServer()).get(`/api/v1/workflow/act/${link}`).expect(410)).body.code).toBe('LINK_EXPIRED');
    });

    it('a sensitive request never shows its words in a card and is decided only after signing in', async () => {
      const item = (await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.hr, name: 'Salary advance', categoryId: ids.catPay, draft: { approval: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any' }], fulfilment: [] } }).expect(201)).body;
      await api('adminA', 'post', `/desk/catalog/admin/items/${item.id}/publish`).send({ version: item.version }).expect(200);
      const before = cards.sent.length;
      await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: item.id, answers: {} }] }).expect(201);
      const body = JSON.stringify(cards.sent.slice(before));
      expect(body).not.toContain('Salary advance');
      expect(body).toContain('An approval is waiting for you');
      expect(body).not.toMatch(/\/yx\/act\//);
      // Even a link made for it refuses to decide.
      const t = await system((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users.mgr, status: 'open' } }));
      const { token: link } = await system((tx) => (app.get(ApprovalCards) as ApprovalCards).mint(tx, org.A.id, t.id, users.mgr, 'push'));
      expect((await request(app.getHttpServer()).get(`/api/v1/workflow/act/${link}`).expect(200)).body).toMatchObject({ state: 'sign_in', summary: [] });
      expect((await request(app.getHttpServer()).post(`/api/v1/workflow/act/${link}`).send({ decision: 'approve' }).expect(403)).body.code).toBe('SIGN_IN_TO_DECIDE');
      await api('mgr', 'post', `/workflow/approvals/tasks/${t.id}/decide`).send({ decision: 'approve' }).expect(200);
    });
  });

  // ------------------------------------------------------------------------------------------ SD-2.11 lifecycles

  describe('lifecycles', () => {
    it('only valid lifecycles publish; tickets pin the version; moves are checked', async () => {
      const desk = (await api('adminA', 'get', `/desk/lifecycles?deskId=${ids.it}`).expect(200)).body;
      const type = desk.types.find((t: { kind: string }) => t.kind === 'incident');
      const st = (label: string) => desk.statuses.find((s: { label: string }) => s.label === label).id as string;
      const [n, p, w, r, c] = ['New', 'In progress', 'Waiting on requester', 'Resolved', 'Closed'].map(st);
      await api('agent', 'get', `/desk/lifecycles?deskId=${ids.it}`).expect(403);
      const lc = (await api('adminA', 'post', '/desk/lifecycles').send({ deskId: ids.it, ticketTypeId: type.id, name: 'Incident flow', draft: { startStatusId: n, statusIds: [n, p, w, r, c], transitions: [{ from: n, to: p }, { from: p, to: r }] } }).expect(201)).body;
      expect((await api('adminA', 'post', `/desk/lifecycles/${lc.id}/check`).expect(200)).body).toEqual({ ok: false, problem: '"Waiting on requester" cannot be reached from the start. Add a move to it or take it out.' });
      await api('adminA', 'post', `/desk/lifecycles/${lc.id}/publish`).send({ version: lc.version }).expect(400);
      const draft = { startStatusId: n, statusIds: [n, p, w, r, c], transitions: [{ from: n, to: p }, { from: p, to: w }, { from: w, to: p }, { from: p, to: r, require: ['resolution_note'] }, { from: r, to: p }, { from: r, to: c, who: 'lead' }] };
      const saved = (await api('adminA', 'patch', `/desk/lifecycles/${lc.id}`).send({ version: lc.version, draft }).expect(200)).body;
      expect((await api('adminA', 'post', `/desk/lifecycles/${lc.id}/publish`).send({ version: saved.version }).expect(200)).body.currentVersion).toBe(1);
      const empPerson = (await system((tx) => tx.personRole.findFirstOrThrow({ where: { roleType: 'login', sourceId: users.emp } }))).personId;
      ids.empPerson = empPerson;
      const t = (await api('agent', 'post', '/desk/tickets').send({ deskId: ids.it, typeId: type.id, subject: 'Screen flickers', bodyHtml: '<p>It flickers.</p>', requesterPersonId: empPerson }).expect(201)).body;
      const row = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }));
      expect(row).toMatchObject({ lifecycleId: lc.id, lifecycleVersion: 1, statusId: n });
      const patch = async (statusId: string, status: number, extra = {}, who: Who = 'agent') => {
        const v = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).version;
        return (await api(who, 'patch', `/desk/tickets/${t.id}`).send({ version: v, statusId, ...extra }).expect(status)).body;
      };
      expect((await patch(r, 409)).message).toMatch(/cannot move from "New" to "Resolved"/);
      await patch(p, 200);
      expect((await patch(r, 409)).message).toBe('Fill in Resolution note first.');
      await patch(r, 200, { resolutionNote: 'Cable replaced' });
      expect((await patch(c, 409)).message).toMatch(/Only a team lead/);
      await patch(c, 200, {}, 'lead');
      // A new version does not change the tickets already on version 1.
      const lc2 = (await api('adminA', 'get', `/desk/lifecycles?deskId=${ids.it}`).expect(200)).body.lifecycles[0];
      await api('adminA', 'post', `/desk/lifecycles/${lc.id}/publish`).send({ version: lc2.version }).expect(200);
      expect((await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).lifecycleVersion).toBe(1);
      // Retire it so the rest of the suite moves tickets freely.
      const lc3 = (await api('adminA', 'get', `/desk/lifecycles?deskId=${ids.it}`).expect(200)).body.lifecycles[0];
      await api('adminA', 'post', `/desk/lifecycles/${lc.id}/retire`).send({ version: lc3.version }).expect(200);
    });
  });

  // ------------------------------------------------------------------------------------------ SD-2.07 documents

  describe('documents and signing', () => {
    it('makes a document with request data, the request waits for the signature, the person signs in the app with evidence', async () => {
      await api('adminA', 'post', '/desk/doc-templates').send({ deskId: ids.it, name: 'Hand-over', body: 'I, {{for_name}}, received {{salary}}.' }).expect(400);
      const tpl = (await api('adminA', 'post', '/desk/doc-templates').send({ deskId: ids.it, name: 'Laptop hand-over', body: 'I, {{for_name}}, received my laptop for {{ticket_number}} on {{today}}.' }).expect(201)).body;
      const missing = (await api('adminA', 'post', '/desk/doc-templates').send({ deskId: ids.it, name: 'Joining check', body: 'Code {{employee_code}} for {{for_name}}.' }).expect(201)).body;
      const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Hand over my laptop', description: 'Please.' }).expect(201)).body;
      ids.docTicket = t.id;
      // The agent has no HR reach: the internal employee code is not filled, so nothing is made (YX-DOC-07 / 08).
      expect((await api('agent', 'post', `/desk/tickets/${t.id}/documents`).send({ templateId: missing.id }).expect(400)).body.code).toBe('DOCUMENT_DATA_MISSING');
      await api('other', 'post', `/desk/tickets/${t.id}/documents`).send({ templateId: tpl.id }).expect(403);
      const doc = (await api('agent', 'post', `/desk/tickets/${t.id}/documents`).send({ templateId: tpl.id }).expect(201)).body;
      expect(doc.status).toBe('pending');
      const v = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).version;
      expect((await api('agent', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: v, resolutionNote: 'Done' }).expect(409)).body.code).toBe('SIGNATURE_PENDING');
      const mine = (await api('emp', 'get', `/desk/my/requests/${t.id}/documents`).expect(200)).body;
      expect(mine[0]).toMatchObject({ needsMe: true, status: 'pending' });
      expect(mine[0].text).toContain(`I, emp ${run}, received my laptop`);
      // Founder decision 9 Oct 2026: a one-time code to the signer's sign-in email comes first.
      await api('other', 'post', `/desk/my/documents/${doc.id}/sign-code`).expect(404);
      await api('other', 'post', `/desk/my/documents/${doc.id}/sign`).send({ decision: 'sign', typedName: `other ${run}`, agree: true, code: '123456' }).expect(404);
      await api('emp', 'post', `/desk/my/documents/${doc.id}/sign`).send({ decision: 'sign', typedName: `emp ${run}`, agree: true }).expect(400);
      expect((await api('emp', 'post', `/desk/my/documents/${doc.id}/sign-code`).expect(200)).body).toMatchObject({ sent: true, minutes: 5 });
      const code = await codeSentTo(`emp@esm2-${run}.test`);
      // A wrong name never uses up the code; a wrong code is refused.
      await api('emp', 'post', `/desk/my/documents/${doc.id}/sign`).send({ decision: 'sign', typedName: 'Someone Else', agree: true, code }).expect(400);
      await api('emp', 'post', `/desk/my/documents/${doc.id}/sign`).send({ decision: 'sign', typedName: `emp ${run}`, code }).expect(400);
      expect((await api('emp', 'post', `/desk/my/documents/${doc.id}/sign`).send({ decision: 'sign', typedName: `emp ${run}`, agree: true, code: code === '000000' ? '111111' : '000000' }).expect(401)).body.code).toBe('SIGN_CODE_WRONG');
      const signed = (await api('emp', 'post', `/desk/my/documents/${doc.id}/sign`).set('User-Agent', 'e2e-browser').send({ decision: 'sign', typedName: `EMP  ${run}`, agree: true, code }).expect(200)).body;
      expect(signed.status).toBe('signed');
      await api('emp', 'post', `/desk/my/documents/${doc.id}/sign`).send({ decision: 'sign', typedName: `emp ${run}`, agree: true, code }).expect(409);
      const row = await system((tx) => tx.sdRequestDocument.findFirstOrThrow({ where: { id: doc.id } }));
      expect(row.evidence).toMatchObject({ method: 'in_app_typed_name_and_code', userAgent: 'e2e-browser', documentSha256: row.sha256, signedByUserId: users.emp });
      // The text of a made document never changes (database guard).
      await expect(system((tx) => tx.sdRequestDocument.update({ where: { id: doc.id }, data: { bodyText: 'changed' } }))).rejects.toThrow(/never changes/);
      const v2 = (await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).version;
      await api('agent', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: v2, resolutionNote: 'Done' }).expect(200);
    });
  });

  // ------------------------------------------------------------------------------------------ SD-2.10

  describe('HR summary, share, move', () => {
    it('the HR summary shows public fields to agents and internal ones only within HR reach; never pay', async () => {
      const agent = (await api('agent', 'get', `/desk/tickets/${ids.docTicket}/hr-summary`).expect(200)).body;
      expect(agent).toMatchObject({ source: 'hr', designation: 'Engineer', department: 'ENG', location: 'Bengaluru', manager: `mgr ${run}`, internal: null });
      const lead = (await api('lead', 'get', `/desk/tickets/${ids.docTicket}/hr-summary`).expect(200)).body;
      expect(lead.internal).toMatchObject({ joinedOn: today, employmentType: 'Permanent' });
      expect(JSON.stringify(lead)).not.toMatch(/salary|ctc|pay/i);
      await api('other', 'get', `/desk/tickets/${ids.docTicket}/hr-summary`).expect(403);
      await api('hrAg', 'get', `/desk/tickets/${ids.docTicket}/hr-summary`).expect(404);
    });

    it('share: view cannot write, comment adds notes but never replies; sensitive tickets are never shared', async () => {
      const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Desk phone', description: 'No tone.' }).expect(201)).body;
      ids.shareTicket = t.id;
      await api('hrAg', 'get', `/desk/tickets/${t.id}`).expect(404);
      await api('agent', 'post', `/desk/tickets/${t.id}/share`).send({ deskId: ids.hr, level: 'view' }).expect(200);
      await api('hrAg', 'get', `/desk/tickets/${t.id}`).expect(200);
      await api('hrAg', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'note', bodyHtml: '<p>FYI</p>' }).expect(403);
      await api('agent', 'post', `/desk/tickets/${t.id}/share`).send({ deskId: ids.hr, level: 'comment' }).expect(200);
      await api('hrAg', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'note', bodyHtml: '<p>FYI</p>' }).expect(201);
      await api('hrAg', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>Hello</p>' }).expect(403);
      await api('agent', 'delete', `/desk/tickets/${t.id}/share/${ids.hr}`).expect(200);
      await api('hrAg', 'get', `/desk/tickets/${t.id}`).expect(404);
      await api('hrAg', 'post', `/desk/tickets/${ids.payTicket}/share`).send({ deskId: ids.it, level: 'view' }).expect(409);
    });

    it('move: only allowed desk pairs; the new desk takes over; a sensitive ticket only into a sensitive category', async () => {
      expect((await api('agent', 'post', `/desk/tickets/${ids.shareTicket}/move`).send({ deskId: ids.hr, reason: 'It is an HR matter' }).expect(403)).body.message).toMatch(/does not move tickets to HR help/);
      await api('agent', 'put', `/desk/desks/${ids.it}/forward-to`).send({ deskIds: [ids.hr] }).expect(403);
      await api('adminA', 'put', `/desk/desks/${ids.it}/forward-to`).send({ deskIds: [ids.hr] }).expect(200);
      const moved = (await api('agent', 'post', `/desk/tickets/${ids.shareTicket}/move`).send({ deskId: ids.hr, reason: 'It is an HR matter' }).expect(200)).body;
      expect(moved.number).toMatch(/^HR-/);
      const [old, now] = await system(async (tx) => [await tx.sdTicket.findFirstOrThrow({ where: { id: ids.shareTicket } }), await tx.sdTicket.findFirstOrThrow({ where: { id: moved.id } })]);
      expect(old.systemState).toBe('closed');
      expect(now).toMatchObject({ deskId: ids.hr, requesterPersonId: old.requesterPersonId });
      await api('hrAg', 'get', `/desk/tickets/${moved.id}`).expect(200);
      // The requester follows the new one.
      await api('emp', 'get', `/desk/my/tickets/${moved.id}`).expect(200);
      // Sensitive: HR → IT has no sensitive category there.
      await api('adminA', 'put', `/desk/desks/${ids.hr}/forward-to`).send({ deskIds: [ids.it] }).expect(200);
      expect((await api('hrAg', 'post', `/desk/tickets/${ids.payTicket}/move`).send({ deskId: ids.it, categoryId: ids.catLaptop, reason: 'Wrong desk' }).expect(400)).body.message).toMatch(/sensitive category/);
    });

    it('clone copies the set-up, not tickets or people; branches route by the requester site', async () => {
      await api('agent', 'post', `/desk/desks/${ids.it}/clone`).send({ name: 'IT Pune', key: 'ITP' }).expect(403);
      const c = (await api('adminA', 'post', `/desk/desks/${ids.it}/clone`).send({ name: 'IT Pune', key: 'ITP' }).expect(201)).body;
      const [cats, members, tickets, items] = await system(async (tx) => [await tx.sdCategory.count({ where: { deskId: c.id } }), await tx.sdDeskMember.count({ where: { deskId: c.id } }), await tx.sdTicket.count({ where: { deskId: c.id } }), await tx.sdCatalogItem.findMany({ where: { deskId: c.id } })]);
      expect(cats).toBeGreaterThan(3);
      expect([members, tickets]).toEqual([0, 0]);
      expect((items as { state: string }[]).every((i) => i.state === 'draft')).toBe(true);
      const team = await system((tx) => tx.sdGroup.create({ data: { organizationId: org.A.id, deskId: ids.it, name: 'Bengaluru floor team' } }));
      await api('agent', 'post', `/desk/desks/${ids.it}/branches`).send({ locationId: ids.blr, groupId: team.id }).expect(403);
      const b = (await api('adminA', 'post', `/desk/desks/${ids.it}/branches`).send({ locationId: ids.blr, groupId: team.id, adminUserId: users.lead }).expect(201)).body;
      const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Wi-Fi drops', description: 'Floor 2.' }).expect(201)).body;
      expect(await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).toMatchObject({ branchId: b.id, groupId: team.id });
      // The branch admin may change the team but not who runs the branch.
      await api('lead', 'patch', `/desk/branches/${b.id}`).send({ version: 1, adminUserId: users.agent }).expect(403);
      await system((tx) => tx.sdDeskBranch.delete({ where: { id: b.id } }).catch(() => undefined));
    });
  });

  // ------------------------------------------------------------------------------------------ SD-2.08 journeys

  it('a new hire in M01 starts the joiner journey once: requests on each desk with tasks due before the first day', async () => {
    const laptop = (await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Joiner laptop', categoryId: ids.catLaptop, journeyOnly: true, draft: { fulfilment: [{ title: 'Image a laptop', groupId: ids.itTeam, olaHours: 8 }] } }).expect(201)).body;
    await api('adminA', 'post', `/desk/catalog/admin/items/${laptop.id}/publish`).send({ version: laptop.version }).expect(200);
    const paper = await system((tx) => tx.sdCatalogItem.findFirstOrThrow({ where: { deskId: ids.hr, name: 'Joining paperwork' } }));
    await api('agent', 'post', '/desk/journeys').send({ kind: 'join', name: 'New joiner', itemIds: [laptop.id] }).expect(403);
    const j = (await api('adminA', 'post', '/desk/journeys').send({ kind: 'join', name: 'New joiner', itemIds: [laptop.id, paper.id] }).expect(201)).body;
    const first = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
    const hire = (globalThis as { __hire?: (g: string, u: string | null, m: string | null, d?: string) => Promise<string> }).__hire!;
    const joiner = await hire('joiner', null, ids.mgrEmp, first);
    let runRow = null;
    for (let i = 0; i < 40 && !runRow; i++) {
      await automation.dispatch();
      runRow = await system((tx) => tx.sdJourneyRun.findFirst({ where: { journeyId: j.id, employeeId: joiner } }));
      if (!runRow) await new Promise((r) => setTimeout(r, 300));
    }
    expect(runRow?.ticketIds).toHaveLength(2);
    const tasks = await system((tx) => tx.sdTask.findMany({ where: { ticketId: { in: runRow!.ticketIds } } }));
    expect(tasks.map((k) => k.title).sort()).toEqual(['Collect joining forms and documents', 'Image a laptop']);
    expect(tasks.every((k) => k.dueAt!.toISOString() === `${first}T03:30:00.000Z`)).toBe(true);
    // Once per person and date: by hand it says it already ran.
    await api('lead', 'post', `/desk/journeys/${j.id}/start`).send({ employeeId: joiner, date: first }).expect(409);
    await api('agent', 'post', `/desk/journeys/${j.id}/start`).send({ employeeId: joiner, date: first }).expect(403);
  });

  // ------------------------------------------------------------------------------------------ SD-2.13

  describe('recurring records and sequences', () => {
    it('makes each due ticket once, marks catch-up runs late and an open earlier one missed; bad rules are refused', async () => {
      await api('adminA', 'post', '/desk/recurring').send({ deskId: ids.it, name: 'Bad', rrule: 'FREQ=MINUTELY', timeZone: 'Asia/Kolkata', startsAt: new Date().toISOString(), template: { subject: 'x', bodyHtml: '<p>x</p>' } }).expect(400);
      await api('agent', 'post', '/desk/recurring').send({ deskId: ids.it, name: 'Bad', rrule: 'FREQ=DAILY', timeZone: 'Asia/Kolkata', startsAt: new Date().toISOString(), template: { subject: 'x', bodyHtml: '<p>x</p>' } }).expect(403);
      const r = (await api('adminA', 'post', '/desk/recurring').send({ deskId: ids.it, name: 'Server room check', rrule: 'FREQ=DAILY', timeZone: 'Asia/Kolkata', startsAt: '2026-01-01T03:30:00.000Z', template: { subject: 'Check the server room', bodyHtml: '<p>Temperature and alarms.</p>', groupId: ids.itTeam } }).expect(201)).body;
      // As if the server was down for three days.
      const now = new Date();
      await system((tx) => tx.sdRecurring.update({ where: { id: r.id }, data: { lastRunAt: new Date(now.getTime() - 3 * 86_400_000 - 60_000), nextRunAt: new Date(now.getTime() - 3 * 86_400_000) } }));
      expect(await recurring.tick(now)).toBe(3);
      expect(await recurring.tick(now)).toBe(0);
      const runs = await system((tx) => tx.sdRecurringRun.findMany({ where: { recurringId: r.id }, orderBy: { dueAt: 'asc' } }));
      expect(runs).toHaveLength(3);
      expect(runs.every((x) => x.late && x.ticketId)).toBe(true);
      expect(runs.map((x) => x.missed)).toEqual([true, true, false]);
      const row = await system((tx) => tx.sdRecurring.findFirstOrThrow({ where: { id: r.id } }));
      expect(row.nextRunAt!.getTime()).toBeGreaterThan(now.getTime());
      // Paused: nothing is made.
      await api('adminA', 'patch', `/desk/recurring/${r.id}`).send({ version: row.version, state: 'paused' }).expect(200);
      expect(await recurring.tick(new Date(now.getTime() + 3 * 86_400_000))).toBe(0);
    });

    it('a sequence replies after its delay and stops when the requester answers', async () => {
      const s = (await api('adminA', 'post', '/desk/sequences').send({ deskId: ids.it, name: 'Nudge', steps: [{ afterHours: 1, bodyHtml: '<p>Any update?</p>' }, { afterHours: 2, bodyHtml: '<p>Still there?</p>' }] }).expect(201)).body;
      const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Printer', description: 'Jams.' }).expect(201)).body;
      await api('other', 'post', `/desk/tickets/${t.id}/sequences`).send({ sequenceId: s.id }).expect(403);
      await api('agent', 'post', `/desk/tickets/${t.id}/sequences`).send({ sequenceId: s.id }).expect(201);
      await api('agent', 'post', `/desk/tickets/${t.id}/sequences`).send({ sequenceId: s.id }).expect(409);
      expect(await recurring.sequenceTick(new Date(Date.now() + 61 * 60_000))).toBeGreaterThanOrEqual(1);
      const replies = await system((tx) => tx.sdTicketMessage.findMany({ where: { ticketId: t.id, kind: 'reply', side: 'agent' } }));
      expect(replies.map((m) => m.bodyText)).toEqual(['Any update?']);
      await api('emp', 'post', `/desk/my/tickets/${t.id}/messages`).send({ text: 'Fixed now' }).expect(201);
      await recurring.sequenceTick(new Date(Date.now() + 4 * 3_600_000));
      const runs = (await api('agent', 'get', `/desk/tickets/${t.id}/sequences`).expect(200)).body;
      expect(runs[0]).toMatchObject({ state: 'stopped', stopReason: 'The requester replied' });
    });
  });

  // ------------------------------------------------------------------------------------------ SD-2.17 interactions

  it('a call is logged as an interaction and becomes a phone ticket when more work is needed', async () => {
    await api('other', 'post', '/desk/interactions').send({ deskId: ids.it, channel: 'call', subject: 'VPN' }).expect(403);
    const i = (await api('agent', 'post', '/desk/interactions').send({ deskId: ids.it, channel: 'call', personId: ids.empPerson, subject: 'VPN keeps dropping', notes: 'Card 4111 1111 1111 1111 mentioned', callRef: 'call-77' }).expect(201)).body;
    const row = await system((tx) => tx.sdInteraction.findFirstOrThrow({ where: { id: i.id } }));
    expect(row.notes).not.toContain('4111 1111 1111 1111');
    const t = (await api('agent', 'post', `/desk/interactions/${i.id}/promote`).send({}).expect(201)).body;
    expect((await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }))).channel).toBe('phone');
    // Other desks' agents and company B never see it.
    expect((await api('hrAg', 'get', `/desk/interactions?deskId=${ids.it}`).expect(403)).body).toBeDefined();
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false, userId: users.agentB }, (tx) => tx.sdInteraction.count({ where: { id: i.id } }))).toBe(0);
  });

  // ------------------------------------------------------------------------------------------ SD-2.18 / SD-2.19 live chat

  describe('live chat', () => {
    it('queues: only the desk admin key sets them up; the pre-chat form is checked', async () => {
      await api('agent', 'post', '/desk/chat/queues').send({ deskId: ids.it, name: 'IT chat' }).expect(403);
      const q = (await api('adminA', 'post', '/desk/chat/queues').send({ deskId: ids.it, name: 'IT chat', maxPerAgent: 1, welcome: 'Hi! Tell us what is wrong.', preChat: { sections: [{ id: 's', columns: 1, fields: [{ key: 'device', type: 'choice', label: 'Which device?', required: true, options: [{ value: 'laptop', label: 'Laptop' }, { value: 'phone', label: 'Phone' }] }] }], rules: [] }, prompts: [{ pathPrefix: '/yx/desk/help', text: 'Need help? Chat with IT.', afterSeconds: 5 }] }).expect(201)).body;
      ids.queue = q.id;
      expect((await api('emp', 'post', '/desk/my/chat').send({ queueId: q.id, subject: 'Laptop slow', answers: {} }).expect(400)).body.code).toBe('FORM_ERRORS');
      await api('empB', 'post', '/desk/my/chat').send({ queueId: q.id, answers: { device: 'laptop' } }).expect(404);
    });

    it('sockets need a live session: no token or a bad one is refused', async () => {
      await expect(new Promise((resolve, reject) => {
        const s = io(`${url}/desk-chat`, { transports: ['websocket'], forceNew: true, reconnection: false });
        sockets.push(s);
        s.on('disconnect', () => resolve('kicked'));
        s.on('connect_error', reject);
        setTimeout(() => reject(new Error('stayed')), 4000);
      })).resolves.toBe('kicked');
      const saved = token.other;
      token.other = 'not-a-token';
      await expect(connect('other')).rejects.toThrow();
      token.other = saved;
    });

    it('employee starts a chat → agent watching sees it → takes it → messages, cards, seen → ticket with the transcript', async () => {
      const agent = await connect('agent');
      expect(await ask(agent, 'chat:watch', { deskId: ids.it })).toEqual({ watching: ids.it });
      const queued = next(agent, 'chat:queue');
      const s = (await api('emp', 'post', '/desk/my/chat').send({ queueId: ids.queue, subject: 'Laptop slow', answers: { device: 'laptop' } }).expect(201)).body;
      ids.chat = s.id;
      expect(await queued).toMatchObject({ sessionId: s.id, state: 'queued' });
      expect((await api('emp', 'get', '/desk/my/chat/queues').expect(200)).body[0]).toMatchObject({ name: 'IT chat', online: true });
      expect((await api('emp', 'get', '/desk/my/chat/prompt?path=/yx/desk/help/123').expect(200)).body).toMatchObject({ text: 'Need help? Chat with IT.', afterSeconds: 5 });
      const emp = await connect('emp');
      expect(await ask(emp, 'chat:join', { sessionId: s.id })).toEqual({ joined: s.id });
      // Not the agent's chat yet: they cannot write in it.
      expect(((await ask(agent, 'chat:send', { sessionId: s.id, text: 'Hi' })).error as { code: string }).code).toBe('REFUSED');
      const joined = next(emp, 'chat:state');
      await api('agent', 'post', `/desk/chat/sessions/${s.id}/accept`).expect(200);
      expect(await joined).toMatchObject({ state: 'active', agentUserId: users.agent });
      expect(await ask(agent, 'chat:join', { sessionId: s.id })).toEqual({ joined: s.id });
      const toAgent = next(agent, 'chat:message');
      await ask(emp, 'chat:send', { sessionId: s.id, text: 'It takes 5 minutes to start. PAN ABCPE1234F' });
      const m1 = await toAgent;
      expect(m1).toMatchObject({ author: 'requester' });
      expect(m1.body).not.toContain('ABCPE1234F');
      const toEmp = next(emp, 'chat:message');
      await ask(agent, 'chat:send', { sessionId: s.id, text: 'Try a restart.', card: { title: 'Did that help?', buttons: [{ label: 'Yes' }, { label: 'No' }] } });
      expect(await toEmp).toMatchObject({ author: 'agent', card: { title: 'Did that help?' } });
      expect(((await ask(emp, 'chat:send', { sessionId: s.id, card: { title: 'x' } })).error as { message: string }).message).toBe('Only the agent sends cards.');
      expect(((await ask(emp, 'chat:send', { sessionId: s.id, text: 'x'.repeat(2001) })).error as { message: string }).message).toMatch(/2000 characters/);
      const seen = next(agent, 'chat:seen');
      await ask(emp, 'chat:seen', { sessionId: s.id });
      expect(await seen).toMatchObject({ by: 'requester' });
      // The agent sees the pre-chat answers first.
      expect((await api('agent', 'get', `/desk/chat/sessions/${s.id}`).expect(200)).body.preChat).toEqual([{ label: 'Which device?', value: 'Laptop' }]);
      // The queue allows one chat per agent.
      const s2 = (await api('other', 'post', '/desk/my/chat').send({ queueId: ids.queue, answers: { device: 'phone' } }).expect(201)).body;
      ids.chat2 = s2.id;
      expect((await api('agent', 'post', `/desk/chat/sessions/${s2.id}/accept`).expect(409)).body.message).toMatch(/most this queue allows/);
      // Unresolved → a ticket with the transcript, owned by the agent.
      const out = (await api('agent', 'post', `/desk/chat/sessions/${s.id}/end`).send({ resolved: false }).expect(200)).body;
      const t = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: out.ticket.id } }));
      expect(t).toMatchObject({ channel: 'chat', assigneeUserId: users.agent, deskId: ids.it });
      const first = await system((tx) => tx.sdTicketMessage.findFirstOrThrow({ where: { ticketId: t.id }, orderBy: { createdAt: 'asc' } }));
      expect(first.bodyText).toContain('Which device?: Laptop');
      expect(first.bodyText).toContain('Try a restart.');
      expect((await api('emp', 'get', `/desk/my/chat/${s.id}`).expect(200)).body.ticket.number).toBe(t.number);
      expect(await system((tx) => tx.sdInteraction.findFirst({ where: { chatSessionId: s.id } }))).toMatchObject({ outcome: 'ticket', ticketId: t.id });
      await api('emp', 'post', `/desk/my/chat/${s.id}/rate`).send({ score: 5, comment: 'Quick' }).expect(200);
      await api('emp', 'post', `/desk/my/chat/${s.id}/rate`).send({ score: 4 }).expect(409);
    });

    it('rooms stay inside one company and one chat; files go through the scan; at most 3 open chats', async () => {
      const b = await connect('empB');
      expect(((await ask(b, 'chat:join', { sessionId: ids.chat2 })).error as { code: string }).code).toBe('NOT_FOUND');
      expect(((await ask(b, 'chat:send', { sessionId: ids.chat2, text: 'hello' })).error as { code: string }).code).toBe('REFUSED');
      const agentB = await connect('agentB');
      expect(((await ask(agentB, 'chat:watch', { deskId: ids.it })).error as { code: string }).code).toBe('DESK_AGENT_SEAT_REQUIRED');
      expect(((await ask(agentB, 'chat:join', { sessionId: ids.chat2 })).error as { code: string }).code).toBe('NOT_FOUND');
      // Another employee of the same company cannot read someone else's chat either.
      const emp = await connect('emp');
      expect(((await ask(emp, 'chat:join', { sessionId: ids.chat2 })).error as { code: string }).code).toBe('NOT_FOUND');
      await api('emp', 'get', `/desk/my/chat/${ids.chat2}`).expect(404);
      // Files: an .exe is refused, a text file waits for the scan.
      await api('other', 'post', `/desk/my/chat/${ids.chat2}/files`).attach('file', Buffer.from('MZ'), 'run.exe').expect(400);
      const f = (await api('other', 'post', `/desk/my/chat/${ids.chat2}/files`).attach('file', Buffer.from('hello'), 'note.txt').expect(201)).body;
      expect(f.scan).toBe('pending');
      // Served only once the scan says clean (the dev scanner runs on the queue).
      for (let i = 0; i < 40 && (await system((tx) => tx.sdChatFile.findFirstOrThrow({ where: { id: f.id } }))).scanStatus === 'pending'; i++) await new Promise((r) => setTimeout(r, 250));
      expect((await api('other', 'post', `/desk/my/chat/${ids.chat2}/files/${f.id}/link`).expect(200)).body.url).toMatch(/^\/desk\/files\//);
      await api('emp', 'post', `/desk/my/chat/${ids.chat2}/files/${f.id}/link`).expect(404);
      for (let i = 0; i < 2; i++) await api('other', 'post', '/desk/my/chat').send({ queueId: ids.queue, answers: { device: 'phone' } }).expect(201);
      expect((await api('other', 'post', '/desk/my/chat').send({ queueId: ids.queue, answers: { device: 'phone' } }).expect(409)).body.message).toMatch(/3 chats open/);
    });

    it('a chat nobody takes in time becomes a ticket', async () => {
      const n = await chat.expire(new Date(Date.now() + 11 * 60_000));
      expect(n).toBeGreaterThanOrEqual(3);
      const s = await system((tx) => tx.sdChatSession.findFirstOrThrow({ where: { id: ids.chat2 } }));
      expect(s).toMatchObject({ state: 'ended', endReason: 'no_agent' });
      expect(s.ticketId).toBeTruthy();
    });

    it('a revoked session is kicked off at the next re-check; a company asking two-step verification keeps aal1 agents out', async () => {
      const agent = await connect('agent');
      expect(await ask(agent, 'chat:watch', { deskId: ids.it })).toEqual({ watching: ids.it });
      const gone = new Promise((resolve) => agent.once('disconnect', resolve));
      const { sid } = JSON.parse(Buffer.from(token.agent.split('.')[1], 'base64url').toString()) as { sid: string };
      await tenantPrisma.forTenant(SUPER, (tx) => tx.session.update({ where: { id: sid }, data: { revokedAt: new Date() } }));
      await gateway.revalidateSockets();
      await expect(gone).resolves.toBeDefined();
      await login('agent', 'A');
      await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.upsert({ where: { organizationId: org.A.id }, create: { organizationId: org.A.id, mfaScope: 'all' }, update: { mfaScope: 'all' } }));
      invalidateTenantSecurityPolicy(org.A.id);
      try {
        const again = await connect('agent');
        expect(((await ask(again, 'chat:watch', { deskId: ids.it })).error as { code: string }).code).toBe('MFA_REQUIRED');
      } finally {
        await tenantPrisma.forTenant(SUPER, (tx) => tx.tenantSecurityPolicy.update({ where: { organizationId: org.A.id }, data: { mfaScope: 'sensitive_roles' } }));
        invalidateTenantSecurityPolicy(org.A.id);
      }
    });

    it('at most 30 events a minute per person', async () => {
      const s = await connect('mgr');
      const answers = [];
      for (let i = 0; i < 31; i++) answers.push(await ask(s, 'chat:seen', { sessionId: randomUUID() }));
      expect((answers[30].error as { code: string }).code).toBe('TOO_MANY');
    });
  });
});
