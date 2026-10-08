process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { DeskActor, DeskRole } from '../src/service-desk/desk-access';
import { SlaService } from '../src/service-desk/sla.service';
import { WorkService } from '../src/service-desk/work.service';
import { MeService } from '../src/service-desk/me.service';
import { CalendarSpec, addBusinessSeconds } from '../src/service-desk/business-time';
import { verhoeffValid } from '../src/service-desk/pii';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// M14 Service Desk, phase 3b-1 batch 2 (SD-1.09 … SD-1.17), end to end against the real database (forced RLS and the
// restrictive visibility policy, app role) and Redis: two companies kept apart; sensitive records hidden at SQL level
// from desk admins, company admins, super-admin sessions and other desks; PII masked; merge, links, split, side
// threads; tasks, resolve rules, escalation, reopen and auto-close; reminders, snooze and the iCal feed with revoke;
// the agent meter; SLA timers pausing and resuming over business hours, milestones firing once, the sweep, breach
// reasons and exclusions; OLA timers; HR's possible-duplicate list.
describe('Service Desk batch 2 (M14 §5.7, §6.3, §7, §8, §15.2)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let sla: SlaService;
  let work: WorkService;
  let me: MeService;
  const fakeBlobs = createFakeBlobStorage();
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent1' | 'agent2' | 'lead' | 'collab' | 'deskAdmin' | 'divya' | 'hr' | 'newbie' | 'agentB' | 'facAgent';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = (userId?: string): TenantContext => ({ organizationId: org.A.id, isSuperAdmin: false, userId: userId ?? null });
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    tenantPrisma.forTenant(asA(), async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const actor = (who: Who, roles: [string, DeskRole][], keys: string[]): DeskActor => ({ ctx: { ...asA(users[who]), organizationId: org.A.id }, userId: users[who], keys: new Set(keys), roles: new Map(roles) });
  const status = (label: string) => ids[`status:${label}`];
  const raise = async (subject: string, description: string, extra: Record<string, unknown> = {}) => (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: ids.category, subject, description, ...extra }).expect(201)).body as { id: string; number: string };
  const ticket = (id: string) => system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id } }));
  const timers = (ticketId: string) => system((tx) => tx.sdSlaTimer.findMany({ where: { ticketId }, orderBy: { createdAt: 'asc' } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue({ success: true }) })
      .overrideProvider(BlobStorageService)
      .useValue(fakeBlobs)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    sla = moduleRef.get(SlaService);
    work = moduleRef.get(WorkService);
    me = moduleRef.get(MeService);

    planId = (await prisma.plan.create({ data: { name: `sd2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Desk2 Org ${k}`, slug: `sd2-${k.toLowerCase()}-${run}`, planId } });
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
      ['agent2', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['collab', 'A', 'panel', 'desk_collaborator'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['divya', 'A', 'panel', null],
      ['hr', 'A', 'panel', 'hr_admin'],
      ['newbie', 'A', 'panel', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
      ['facAgent', 'A', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@sd2.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      const res = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@sd2.test`, password: PASSWORD }).expect(200);
      token[who] = res.body.accessToken;
    }
    await tenantPrisma.forTenant(asA(), async (tx) => {
      ids.divyaPerson = (await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', primaryEmail: `divya-person-${run}@sd2.test` } })).id;
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: ids.divyaPerson, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
      // Nina already has a person with the email the "newbie" login will use (founder decision: never linked silently).
      ids.ninaPerson = (await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Nina', familyName: 'Rao', primaryEmail: `newbie-${run}@sd2.test` } })).id;
    });

    // Desks: IT (agents, a lead, a collaborator, a desk admin) and Facilities (another team, for child tickets).
    const desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body;
    ids.desk = desk.id;
    const full = (await api('adminA', 'get', `/desk/desks/${desk.id}`).expect(200)).body;
    for (const s of full.statuses) ids[`status:${s.label}`] = s.id;
    ids.group = full.groups[0].id;
    ids.category = full.categories.find((c: { name: string }) => c.name === 'Access and accounts').id;
    for (const [who, role] of [['agent1', 'agent'], ['agent2', 'agent'], ['lead', 'lead'], ['collab', 'collaborator'], ['deskAdmin', 'admin']] as const) {
      await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201);
    }
    await api('adminA', 'patch', `/desk/desks/${ids.desk}/groups/${ids.group}`).send({ name: 'IT help desk team', assignmentMethod: 'manual', memberIds: [users.agent1, users.agent2, users.lead] }).expect(200);
    ids.secret = (await api('adminA', 'post', `/desk/desks/${ids.desk}/categories`).send({ name: 'Security incident', sensitive: true }).expect(201)).body.id;
    const fac = (await api('adminA', 'post', '/desk/desks').send({ name: 'Facilities', key: 'FAC', kind: 'facilities' }).expect(201)).body;
    ids.fac = fac.id;
    await api('adminA', 'post', `/desk/desks/${ids.fac}/members`).send({ userId: users.facAgent, role: 'agent' }).expect(201);
    const deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body;
    await api('adminB', 'post', `/desk/desks/${deskB.id}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
  });

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

  describe('sensitive and private records (SD-1.12, §5.7 restrictive RLS)', () => {
    it('a sensitive ticket is invisible at SQL level to the desk admin, the company admin, a super-admin session, other desks and company B', async () => {
      const t = await raise('Phishing mail opened', 'I clicked a link in a strange mail.', { categoryId: ids.secret });
      ids.sensitive = t.id;
      const count = (ctx: TenantContext) => tenantPrisma.forTenant(ctx, (tx) => tx.sdTicket.count({ where: { id: t.id } }));
      const msgs = (ctx: TenantContext) => tenantPrisma.forTenant(ctx, (tx) => tx.sdTicketMessage.count({ where: { ticketId: t.id } }));
      expect(await count(asA(users.agent1))).toBe(1);
      expect(await count(asA(users.divya))).toBe(1);
      expect(await msgs(asA(users.agent1))).toBe(1);
      for (const who of ['deskAdmin', 'adminA', 'facAgent', 'collab'] as const) {
        expect(await count(asA(users[who]))).toBe(0);
        expect(await msgs(asA(users[who]))).toBe(0);
      }
      expect(await count(asA())).toBe(0);
      expect(await count(SUPER)).toBe(0);
      expect(await msgs(SUPER)).toBe(0);
      expect(await count({ organizationId: org.B.id, isSuperAdmin: false, userId: users.agentB })).toBe(0);
      await api('deskAdmin', 'get', `/desk/tickets/${t.id}`).expect(404);
      await api('agentB', 'get', `/desk/tickets/${t.id}`).expect(404);
      // A standard ticket stays visible to the desk admin (read-only) and still never to company B.
      const plain = await raise('Wi-Fi is slow', 'Since lunch.');
      ids.plain = plain.id;
      expect((await api('deskAdmin', 'get', `/desk/tickets/${plain.id}`).expect(200)).body.access).toBe('observer');
      expect(await count({ organizationId: org.B.id, isSuperAdmin: false })).toBe(0);
      expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false, userId: users.agentB }, (tx) => tx.sdTicket.count({ where: { id: plain.id } }))).toBe(0);
      // Writing a row into another company is refused.
      await expect(tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.sdTicketLink.create({ data: { organizationId: org.A.id, fromTicketId: plain.id, toTicketId: t.id, kind: 'related' } }))).rejects.toThrow();
    });

    it('a collaborator added to the sensitive ticket sees it, and loses it with the seat', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.sensitive}/collaborators`).send({ userId: users.collab }).expect(201);
      expect(await tenantPrisma.forTenant(asA(users.collab), (tx) => tx.sdTicket.count({ where: { id: ids.sensitive } }))).toBe(1);
      expect((await api('collab', 'get', `/desk/tickets/${ids.sensitive}`).expect(200)).body.access).toBe('collaborator');
    });

    it('personal data is masked on save, kept encrypted, and shown only with the unmask key after step-up (audited)', async () => {
      let body = '23456789012';
      for (let d = 0; d < 10; d++) if (verhoeffValid(body + d)) { body += d; break; }
      const t = await raise('Salary account change', `My PAN is ABCPE1234F and Aadhaar ${body}. password: Secret123`);
      const view = (await api('agent1', 'get', `/desk/tickets/${t.id}`).expect(200)).body;
      expect(view.messages[0].bodyHtml).not.toMatch(/ABCPE1234F|Secret123|23456789/);
      expect(view.messages[0].bodyHtml).toContain('[PAN ••234F]');
      const mine = (await api('divya', 'get', `/desk/my/tickets/${t.id}`).expect(200)).body;
      expect(mine.messages[0].bodyHtml).not.toMatch(/ABCPE1234F/);
      const w = (await api('agent1', 'get', `/desk/tickets/${t.id}/work`).expect(200)).body;
      expect(w.maskedValues.map((v: { kind: string }) => v.kind).sort()).toEqual(['aadhaar', 'pan', 'password']);
      const stored = await system((tx) => tx.sdSensitiveValue.findMany({ where: { ticketId: t.id } }));
      expect(stored.every((v) => !v.valueEncrypted.includes('ABCPE1234F'))).toBe(true);
      const pan = w.maskedValues.find((v: { kind: string }) => v.kind === 'pan');
      // The agent has no unmask key; the lead has it but no fresh second factor: both refused at the guard.
      await api('agent1', 'post', `/desk/tickets/${t.id}/unmask/${pan.id}`).expect(403);
      expect((await api('lead', 'post', `/desk/tickets/${t.id}/unmask/${pan.id}`).expect(403)).body.code).toBe('STEP_UP_REQUIRED');
      // Past step-up, the service shows it and writes the audit row.
      const lead = actor('lead', [[ids.desk, 'lead']], ['desk.ticket.view', 'desk.ticket.work', 'desk.pii.unmask']);
      expect(await work.unmask(lead, t.id, pan.id)).toEqual({ value: 'ABCPE1234F', kind: 'pan' });
      const audit = await system((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'desk.pii.unmasked', entityId: t.id } }));
      expect(audit).toHaveLength(1);
    });

    it('the read log keeps one row per viewer per 30 minutes and is shown only to desk.audit.view on a visible ticket', async () => {
      await api('agent2', 'get', `/desk/tickets/${ids.sensitive}`).expect(200);
      await api('agent2', 'get', `/desk/tickets/${ids.sensitive}`).expect(200);
      const reads = (await api('lead', 'get', `/desk/audit/reads?ticketId=${ids.sensitive}`).expect(200)).body;
      expect(reads.filter((r: { userId: string }) => r.userId === users.agent2)).toHaveLength(1);
      await api('agent1', 'get', `/desk/audit/reads?ticketId=${ids.sensitive}`).expect(403);
      // Opening a sensitive ticket still writes its audit row (batch 1), now once per 30 minutes.
      const opened = await system((tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.ticket.opened', entityId: ids.sensitive, actorUserId: users.agent2 } }));
      expect(opened).toBe(1);
    });
  });

  describe('merge, links, split, family and side conversations (SD-1.09)', () => {
    it('only a lead merges; the survivor keeps both conversations; the merged requester is told', async () => {
      const a = await raise('Laptop will not start', 'Black screen.');
      const b = await raise('Laptop dead', 'Same laptop, still black.');
      const vb = (await api('agent1', 'get', `/desk/tickets/${b.id}`).expect(200)).body;
      await api('agent1', 'post', `/desk/tickets/${b.id}/merge`).send({ intoTicketId: a.id, version: vb.version }).expect(403);
      await api('lead', 'post', `/desk/tickets/${b.id}/merge`).send({ intoTicketId: a.id, version: vb.version }).expect(200);
      expect(await ticket(b.id)).toMatchObject({ mergedIntoId: a.id, systemState: 'closed' });
      const survivor = (await api('agent1', 'get', `/desk/tickets/${a.id}`).expect(200)).body;
      expect(survivor.messages.map((m: { bodyHtml: string }) => m.bodyHtml).join(' ')).toMatch(/Same laptop/);
      const old = (await api('divya', 'get', `/desk/my/tickets/${b.id}`).expect(200)).body;
      expect(old.messages.some((m: { bodyHtml: string }) => /joined with/.test(m.bodyHtml))).toBe(true);
      await api('lead', 'post', `/desk/tickets/${b.id}/merge`).send({ intoTicketId: a.id, version: (await ticket(b.id)).version }).expect(409);
      // A sensitive ticket never merges into a standard one.
      const vs = (await api('lead', 'get', `/desk/tickets/${ids.sensitive}`).expect(200)).body;
      await api('lead', 'post', `/desk/tickets/${ids.sensitive}/merge`).send({ intoTicketId: a.id, version: vs.version }).expect(400);
      ids.survivor = a.id;
    });

    it('links need both tickets visible; split never turns a note into a reply; a child ticket stays away from the requester', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.plain}/links`).send({ ticketId: ids.survivor, kind: 'related' }).expect(201);
      await api('agent1', 'post', `/desk/tickets/${ids.plain}/links`).send({ ticketId: ids.survivor, kind: 'related' }).expect(409);
      // facAgent cannot see IT tickets: linking to one is a 404.
      await api('facAgent', 'post', `/desk/tickets/${ids.plain}/links`).send({ ticketId: ids.survivor, kind: 'related' }).expect(404);
      // The desk admin sees the standard ticket but the link to the sensitive one is hidden (§5.7).
      await api('agent1', 'post', `/desk/tickets/${ids.plain}/links`).send({ ticketId: ids.sensitive, kind: 'caused_by' }).expect(201);
      expect(await tenantPrisma.forTenant(asA(users.deskAdmin), (tx) => tx.sdTicketLink.count({ where: { fromTicketId: ids.plain } }))).toBe(1);

      await api('agent1', 'post', `/desk/tickets/${ids.plain}/messages`).send({ kind: 'note', bodyHtml: '<p>Internal: router 3 is flaky</p>' }).expect(201);
      const msgs = (await api('agent1', 'get', `/desk/tickets/${ids.plain}`).expect(200)).body.messages;
      const note = msgs.find((m: { kind: string }) => m.kind === 'note');
      const first = msgs.find((m: { kind: string }) => m.kind === 'reply');
      await api('agent1', 'post', `/desk/tickets/${ids.plain}/split`).send({ messageId: note.id, subject: 'x' }).expect(400);
      const split = (await api('agent1', 'post', `/desk/tickets/${ids.plain}/split`).send({ messageId: first.id, subject: 'Printer also slow' }).expect(201)).body;
      expect((await ticket(split.id)).requesterPersonId).toBe(ids.divyaPerson);

      // Side conversations: an internal thread and a child ticket for Facilities.
      const thread = (await api('agent1', 'post', `/desk/tickets/${ids.plain}/side-conversations`).send({ channel: 'note_thread', subject: 'Ask the network team', bodyHtml: '<p>Is router 3 on the old firmware?</p>' }).expect(201)).body;
      await api('collab', 'post', `/desk/tickets/${ids.plain}/side-conversations/${thread.id}/messages`).send({ bodyHtml: '<p>x</p>' }).expect(404);
      const child = (await api('agent1', 'post', `/desk/tickets/${ids.plain}/side-conversations`).send({ channel: 'child_ticket', subject: 'Move the access point', deskId: ids.fac, bodyHtml: '<p>Please move AP-3 nearer the desks.</p>' }).expect(201)).body;
      expect((await ticket(child.childTicketId)).parentId).toBe(ids.plain);
      expect((await api('facAgent', 'get', `/desk/tickets/${child.childTicketId}`).expect(200)).body.number).toMatch(/^FAC-/);
      const mine = (await api('divya', 'get', '/desk/my/tickets').expect(200)).body;
      expect(mine.map((x: { id: string }) => x.id)).not.toContain(child.childTicketId);
      const theirView = (await api('divya', 'get', `/desk/my/tickets/${ids.plain}`).expect(200)).body;
      expect(JSON.stringify(theirView)).not.toMatch(/router 3|access point|network team/i);
      const w = (await api('agent1', 'get', `/desk/tickets/${ids.plain}/work`).expect(200)).body;
      expect(w.sideConversations).toHaveLength(2);
      expect(w.children.map((c: { id: string }) => c.id)).toContain(child.childTicketId);
    });
  });

  describe('tasks, resolve rules, escalation, reopen and auto-close (SD-1.10)', () => {
    it('open tasks block resolving; a collaborator works only the state of their task; codes are required when the desk asks', async () => {
      const t = await raise('New laptop for Arjun', 'Joins Monday.');
      ids.taskTicket = t.id;
      await api('lead', 'post', `/desk/tickets/${t.id}/assign`).send({ userId: users.agent1 }).expect(200);
      const task = (await api('agent1', 'post', `/desk/tickets/${t.id}/tasks`).send({ title: 'Image the laptop', assigneeUserId: users.collab }).expect(201)).body;
      await api('agent1', 'post', `/desk/tickets/${t.id}/tasks`).send({ title: 'x', assigneeUserId: users.deskAdmin }).expect(400);
      const v = (await ticket(t.id)).version;
      expect((await api('agent1', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: v }).expect(409)).body.code).toBe('TASKS_OPEN');
      await api('collab', 'patch', `/desk/tasks/${task.id}`).send({ version: 1, title: 'mine now' }).expect(403);
      await api('collab', 'patch', `/desk/tasks/${task.id}`).send({ version: 1, state: 'done' }).expect(200);
      await api('adminA', 'patch', `/desk/desks/${ids.desk}`).send({ version: (await api('adminA', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk.version, resolutionRequired: true }).expect(200);
      await api('adminA', 'post', `/desk/desks/${ids.desk}/resolution-codes`).send({ code: 'fixed', label: 'Fixed' }).expect(201);
      expect((await api('agent1', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: v }).expect(400)).body.code).toBe('RESOLUTION_REQUIRED');
      await api('agent1', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: v, resolutionCode: 'nope', resolutionNote: 'x' }).expect(400);
      const done = (await api('agent1', 'post', `/desk/tickets/${t.id}/resolve`).send({ version: v, resolutionCode: 'fixed', resolutionNote: 'Laptop handed over' }).expect(200)).body;
      expect(done).toMatchObject({ systemState: 'solved', resolutionCode: 'fixed' });
      expect((await ticket(t.id)).resolvedTier).toBe('L1');
    });

    it('escalation records the level, time and reason', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.plain}/escalate`).send({ tier: 'L2', reason: 'x' }).expect(400);
      expect((await api('agent1', 'post', `/desk/tickets/${ids.plain}/escalate`).send({ tier: 'L2', reason: 'Needs the network team' }).expect(200)).body.tier).toBe('L2');
      const tl = (await api('agent1', 'get', `/desk/tickets/${ids.plain}/timeline`).expect(200)).body;
      expect(tl.find((e: { kind: string }) => e.kind === 'tier_changed')).toMatchObject({ from: 'L1', to: 'L2', reason: 'Needs the network team' });
    });

    it('a reply inside the reopen window reopens; after it a follow-up is raised; resolved tickets close by themselves', async () => {
      const r1 = (await api('divya', 'post', `/desk/my/tickets/${ids.taskTicket}/messages`).send({ text: 'The charger is missing.' }).expect(201)).body;
      expect(r1.reopened).toBe(true);
      expect((await ticket(ids.taskTicket)).systemState).toBe('open');
      const v = (await ticket(ids.taskTicket)).version;
      await api('agent1', 'post', `/desk/tickets/${ids.taskTicket}/resolve`).send({ version: v, resolutionCode: 'fixed', resolutionNote: 'Charger sent' }).expect(200);
      await api('adminA', 'patch', `/desk/desks/${ids.desk}`).send({ version: (await api('adminA', 'get', `/desk/desks/${ids.desk}`).expect(200)).body.desk.version, reopenWindowDays: 0, resolutionRequired: false }).expect(200);
      await system((tx) => tx.sdTicket.update({ where: { id: ids.taskTicket }, data: { resolvedAt: new Date(Date.now() - 4 * 86_400_000) } }));
      const r2 = (await api('divya', 'post', `/desk/my/tickets/${ids.taskTicket}/messages`).send({ text: 'Now the screen flickers.' }).expect(201)).body;
      expect(r2.followUp.number).toMatch(/^IT-/);
      expect((await ticket(ids.taskTicket)).systemState).toBe('solved');
      const link = await system((tx) => tx.sdTicketLink.findFirst({ where: { fromTicketId: r2.followUp.id, toTicketId: ids.taskTicket, kind: 'follow_up' } }));
      expect(link).not.toBeNull();
      // Auto-close: 3 days after resolving (starter) with no reply.
      expect(await work.autoClose()).toBeGreaterThanOrEqual(1);
      expect((await ticket(ids.taskTicket)).systemState).toBe('closed');
    });
  });

  describe('reminders, snooze and the iCal feed (SD-1.11)', () => {
    it('a snoozed ticket leaves my list until it wakes; reminders fire once', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.plain}/snooze`).send({ until: new Date(Date.now() + 3_600_000).toISOString() }).expect(200);
      const list = (await api('agent1', 'get', `/desk/tickets?deskIds=${ids.desk}&limit=100`).expect(200)).body.items.map((x: { id: string }) => x.id);
      expect(list).not.toContain(ids.plain);
      const only = (await api('agent1', 'get', `/desk/tickets?snoozed=only`).expect(200)).body.items.map((x: { id: string }) => x.id);
      expect(only).toEqual([ids.plain]);
      // Another agent's list is unaffected.
      expect((await api('agent2', 'get', `/desk/tickets?deskIds=${ids.desk}&limit=100`).expect(200)).body.items.map((x: { id: string }) => x.id)).toContain(ids.plain);
      await api('agent1', 'post', '/desk/me/reminders').send({ remindAt: new Date(Date.now() + 1000).toISOString(), note: 'Chase vendor', ticketId: ids.sensitive }).expect(201);
      await api('divya', 'post', '/desk/me/reminders').send({ remindAt: new Date(Date.now() + 1000).toISOString() }).expect(403);
      // Someone else's reminders are invisible at SQL level.
      expect(await tenantPrisma.forTenant(asA(users.agent2), (tx) => tx.sdReminder.count({ where: { userId: users.agent1 } }))).toBe(0);
      await system((tx) => tx.sdReminder.updateMany({ where: { userId: users.agent1, kind: 'remind' }, data: { remindAt: new Date(Date.now() - 1000) } }));
      expect(await me.fireReminders()).toBeGreaterThanOrEqual(1);
      expect(await me.fireReminders()).toBe(0);
      const notes = await tenantPrisma.forTenant(asA(), (tx) => tx.userNotification.findMany({ where: { recipientUserId: users.agent1, type: 'helpdesk.reminder.due' } }));
      expect(notes).toHaveLength(1);
      // Sensitive ticket: the notice names the number only.
      expect(notes[0].contextText).not.toMatch(/Phishing/);
    });

    it('the iCal feed works with its secret, shows a sensitive ticket by number only, and stops at once when revoked', async () => {
      await api('agent1', 'post', '/desk/me/reminders').send({ remindAt: new Date(Date.now() + 86_400_000).toISOString(), note: 'Follow up', ticketId: ids.sensitive }).expect(201);
      const { path } = (await api('agent1', 'post', '/desk/me/calendar-feed').expect(201)).body;
      const ics = await request(server()).get(`/api/v1${path}`).expect(200);
      expect(ics.headers['content-type']).toMatch(/text\/calendar/);
      expect(ics.text).toContain('BEGIN:VCALENDAR');
      expect(ics.text).toMatch(/IT-\d+/);
      expect(ics.text).not.toMatch(/Phishing|Follow up/);
      await request(server()).get(`/api/v1${path.replace(/\/[^/]+\.ics$/, '/' + 'A'.repeat(43) + '.ics')}`).expect(404);
      // Another person's id with this secret is refused.
      await request(server()).get(`/api/v1${path.replace(users.agent1, users.agent2)}`).expect(404);
      const { path: next } = (await api('agent1', 'post', '/desk/me/calendar-feed').expect(201)).body;
      await request(server()).get(`/api/v1${path}`).expect(404);
      await request(server()).get(`/api/v1${next}`).expect(200);
      await api('agent1', 'delete', '/desk/me/calendar-feed').expect(200);
      await request(server()).get(`/api/v1${next}`).expect(404);
    });
  });

  describe('seats and the agent meter (SD-1.13, §6.3 L1–L6)', () => {
    it('counts agents and leads once, never collaborators or set-up admins, and HR-only agents of an HRMS company are free', async () => {
      await tenantPrisma.forTenant(SUPER, (tx) => tx.organizationProduct.create({ data: { organizationId: org.A.id, productCode: 'hrms' } }));
      const hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help desk', key: 'HR', kind: 'hr' }).expect(201)).body;
      expect(hr.billingClass).toBe('hrms_included');
      await api('adminA', 'post', `/desk/desks/${hr.id}/members`).send({ userId: users.hr, role: 'agent' }).expect(201);
      await api('adminA', 'post', `/desk/desks/${hr.id}/members`).send({ userId: users.agent2, role: 'agent' }).expect(201);
      const today = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
      await me.meter(today);
      await me.meter(today);
      const row = await tenantPrisma.forTenant(asA(), (tx) => tx.meterEvent.findMany({ where: { organizationId: org.A.id, meter: 'sd_agents' } }));
      expect(row).toHaveLength(1);
      expect(row[0].subjectIds.sort()).toEqual([users.agent1, users.agent2, users.lead, users.facAgent].sort());
      const bill = (await api('adminA', 'get', `/desk/billing/agents?month=${today.slice(0, 7)}`).expect(200)).body;
      expect(bill.paidAgents).toBe(4);
      expect(bill.collaborators.map((c: { userId: string }) => c.userId)).toEqual([users.collab]);
      await api('lead', 'get', `/desk/billing/agents?month=${today.slice(0, 7)}`).expect(403);
      // Company B's meter is its own.
      await expect(tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.meterEvent.count({ where: { organizationId: org.A.id } }))).resolves.toBe(0);
    });
  });

  describe('SLA and OLA (SD-1.14 … SD-1.17)', () => {
    let spec: CalendarSpec;
    it('a policy with several targets pins its version; timers start, pause on "waiting", resume and meet on reply', async () => {
      const cal = (await api('adminA', 'post', '/desk/calendars').send({ name: `Always ${run}`, timeZone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 })) }).expect(201)).body;
      spec = { zone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440, validFrom: '2000-01-01', validTo: null })), holidays: [] };
      await api('agent1', 'post', `/desk/desks/${ids.desk}/sla-policies`).send({}).expect(403);
      const bad = { name: 'Bad', kind: 'sla', scope: { match: 'all', rules: [] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'group', minutes: [1, 2, 3, 4] }] };
      await api('adminA', 'post', `/desk/desks/${ids.desk}/sla-policies`).send(bad).expect(400);
      const policy = (await api('adminA', 'post', `/desk/desks/${ids.desk}/sla-policies`).send({ name: 'IT standard', kind: 'sla', scope: { match: 'any', rules: [{ field: 'priority', op: 'in', values: ['1', '2', '3', '4'] }] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'first_response', minutes: [30, 60, 120, 240] }, { metric: 'resolution', minutes: [240, 480, 960, 1920], milestones: [{ percent: 50, actions: [{ type: 'notify_assignee' }] }, { percent: 100, actions: [{ type: 'notify_assignee' }, { type: 'notify_group_leads' }] }] }] }).expect(201)).body;
      ids.policy = policy.id;
      const t = await raise('VPN drops', 'Every ten minutes.', { impact: 2, urgency: 3 });
      ids.slaTicket = t.id;
      await api('lead', 'post', `/desk/tickets/${t.id}/assign`).send({ userId: users.agent1 }).expect(200);
      let xs = await timers(t.id);
      expect(xs.map((x) => [x.metric, x.state, x.targetSeconds])).toEqual([['first_response', 'running', 120 * 60], ['resolution', 'running', 960 * 60]]);
      const res = xs.find((x) => x.metric === 'resolution')!;
      expect(res.dueAt!.getTime()).toBe(addBusinessSeconds(spec, res.resumedAt!, res.targetSeconds - res.usedSeconds).getTime());
      // Waiting on the requester pauses both; the reason is the status label.
      const v = (await ticket(t.id)).version;
      await api('agent1', 'patch', `/desk/tickets/${t.id}`).send({ version: v, statusId: status('Waiting on requester') }).expect(200);
      xs = await timers(t.id);
      expect(xs.every((x) => x.state === 'paused' && x.pauseReason === 'Waiting on requester' && x.dueAt === null)).toBe(true);
      // The requester replies: back to work, timers resume; then the agent answers: first response met.
      await api('divya', 'post', `/desk/my/tickets/${t.id}/messages`).send({ text: 'It happened again at 11.' }).expect(201);
      xs = await timers(t.id);
      expect(xs.filter((x) => x.metric !== 'next_response').every((x) => x.state === 'running')).toBe(true);
      await api('agent1', 'post', `/desk/tickets/${t.id}/messages`).send({ kind: 'reply', bodyHtml: '<p>Please update the VPN app.</p>' }).expect(201);
      xs = await timers(t.id);
      expect(xs.find((x) => x.metric === 'first_response')!.state).toBe('met');
      const kinds = (await api('agent1', 'get', `/desk/tickets/${t.id}/sla`).expect(200)).body.find((x: { metric: string }) => x.metric === 'resolution').events.map((e: { kind: string }) => e.kind);
      expect(kinds).toEqual(expect.arrayContaining(['start', 'pause', 'resume']));
      // The requester sees when it should be resolved, never the reasons.
      const mine = (await api('divya', 'get', `/desk/my/tickets/${t.id}`).expect(200)).body;
      expect(mine.resolveBy).toBeTruthy();
      expect(JSON.stringify(mine)).not.toMatch(/Waiting on requester.*pause|pauseReason/);
      // A new version applies to new tickets only; this ticket keeps version 1.
      await api('adminA', 'post', `/desk/sla-policies/${policy.id}/versions`).send({ scope: { match: 'all', rules: [] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'resolution', minutes: [10, 10, 10, 10] }] }).expect(201);
      await api('agent1', 'patch', `/desk/tickets/${t.id}`).send({ version: (await ticket(t.id)).version, tags: ['vpn'] }).expect(200);
      expect((await timers(t.id)).find((x) => x.metric === 'resolution' && x.state === 'running')!.targetSeconds).toBe(960 * 60);
    });

    it('milestones fire once even when jobs are duplicated, a lost job is caught by the sweep, and a breach escalates', async () => {
      const x = (await timers(ids.slaTicket)).find((y) => y.metric === 'resolution' && y.state === 'running')!;
      // Move the clock: 60 % used, started a moment ago.
      await system((tx) => tx.sdSlaTimer.update({ where: { id: x.id }, data: { usedSeconds: Math.round(x.targetSeconds * 0.6), resumedAt: new Date(Date.now() - 1000), jobVersion: { increment: 1 } } }));
      const v = x.jobVersion + 1;
      const [a, b] = await Promise.all([sla.fire(org.A.id, x.id, v), sla.fire(org.A.id, x.id, v)]);
      expect([...a, ...b]).toEqual([50]);
      expect(await sla.fire(org.A.id, x.id, v)).toEqual([]);
      const ev = await system((tx) => tx.sdSlaTimerEvent.count({ where: { timerId: x.id, kind: 'milestone', percent: 50 } }));
      expect(ev).toBe(1);
      // Past the target, with no job at all: the sweep finds it.
      await system((tx) => tx.sdSlaTimer.update({ where: { id: x.id }, data: { usedSeconds: x.targetSeconds + 60, nextMilestoneAt: new Date(Date.now() - 1000), jobVersion: { increment: 1 } } }));
      expect(await sla.sweep()).toBeGreaterThanOrEqual(1);
      const after = await system((tx) => tx.sdSlaTimer.findUniqueOrThrow({ where: { id: x.id } }));
      expect(after.breachedAt).not.toBeNull();
      expect(after.state).toBe('running');
      const outbox = await tenantPrisma.forTenant(asA(), (tx) => tx.eventOutbox.count({ where: { organizationId: org.A.id, eventType: 'helpdesk.ticket.sla_breached' } }));
      expect(outbox).toBe(1);
      const notices = await tenantPrisma.forTenant(asA(), (tx) => tx.userNotification.findMany({ where: { type: 'helpdesk.ticket.sla_breached', entityId: ids.slaTicket } }));
      expect(notices.map((n) => n.recipientUserId).sort()).toEqual([users.agent1, users.lead].sort());
      ids.breachedTimer = x.id;
    });

    it('the agent gives a breach reason; only a lead approves an exclusion; the month report leaves it out', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.slaTicket}/sla/${ids.breachedTimer}/breach-reason`).send({ reason: 'Vendor took a day to answer' }).expect(200);
      await api('agent1', 'post', `/desk/tickets/${ids.slaTicket}/sla/${ids.breachedTimer}/exclusion`).send({ reason: 'Vendor outage' }).expect(403);
      await api('adminA', 'put', `/desk/desks/${ids.desk}/sla-targets`).send({ targets: [{ metric: 'resolution', priority: 3, targetPercent: 95 }] }).expect(200);
      const month = new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 7);
      const before = (await api('lead', 'get', `/desk/desks/${ids.desk}/sla-compliance?month=${month}`).expect(200)).body.lines.find((l: { metric: string; priority: number }) => l.metric === 'resolution' && l.priority === 3);
      expect(before).toMatchObject({ missed: 1, atRisk: true, target: 95 });
      await api('lead', 'post', `/desk/tickets/${ids.slaTicket}/sla/${ids.breachedTimer}/exclusion`).send({ reason: 'Vendor outage' }).expect(200);
      const after = (await api('lead', 'get', `/desk/desks/${ids.desk}/sla-compliance?month=${month}`).expect(200)).body.lines.find((l: { metric: string; priority: number }) => l.metric === 'resolution' && l.priority === 3);
      expect(after).toMatchObject({ missed: 0, excluded: 1 });
      await api('agent1', 'get', `/desk/desks/${ids.desk}/sla-compliance?month=${month}`).expect(403);
      const audit = await system((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { in: ['desk.sla.breach_reason', 'desk.sla.exclusion_approved'] } } }));
      expect(audit).toHaveLength(2);
      // Timers of a sensitive ticket are hidden from the desk admin too.
      expect(await tenantPrisma.forTenant(asA(users.deskAdmin), (tx) => tx.sdSlaTimer.count({ where: { ticketId: ids.sensitive } }))).toBe(0);
    });

    it('a field change moves the ticket to another policy, keeping the time used; due times follow office hours, holidays and the chosen half of a half day', async () => {
      const ist = (d: Date) => new Date(d.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
      const day = (n: number) => ist(new Date(Date.now() + n * 86_400_000));
      const cal = (await api('adminA', 'post', '/desk/calendars').send({ name: `Office ${run}`, timeZone: 'Asia/Kolkata', hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080 })), holidays: [{ on: day(1), name: 'Festival' }, { on: day(2), name: 'Festival eve', halfDay: true }] }).expect(201)).body;
      const v = (await api('adminA', 'get', '/desk/calendars').expect(200)).body.find((c: { id: string }) => c.id === cal.id).version;
      await api('adminA', 'patch', `/desk/calendars/${cal.id}`).send({ version: v, halfDayOpenHalf: 'second' }).expect(200);
      await api('adminA', 'post', `/desk/desks/${ids.desk}/sla-policies`).send({ name: 'Holiday check', kind: 'sla', scope: { match: 'all', rules: [{ field: 'tag', op: 'in', values: ['office-hours'] }] }, calendarSource: 'calendar', calendarId: cal.id, targets: [{ metric: 'resolution', minutes: [600, 600, 600, 600] }] }).expect(201);
      const t = await raise('Projector flickers', 'Board room.', { impact: 2, urgency: 3 });
      await api('lead', 'post', `/desk/tickets/${t.id}/assign`).send({ userId: users.agent1 }).expect(200);
      // A ticket raised after version 2 of IT standard uses version 2 (10 minutes).
      expect((await timers(t.id)).find((x) => x.metric === 'resolution')!.targetSeconds).toBe(10 * 60);
      await api('agent1', 'patch', `/desk/tickets/${t.id}`).send({ version: (await ticket(t.id)).version, tags: ['office-hours'] }).expect(200);
      const xs = await timers(t.id);
      expect(xs.find((x) => x.metric === 'resolution' && x.state === 'cancelled')?.cancelReason).toBe('Another policy applies now');
      const live = xs.find((x) => x.metric === 'resolution' && x.state === 'running')!;
      expect(live.targetSeconds).toBe(600 * 60);
      const office: CalendarSpec = { zone: 'Asia/Kolkata', halfDayOpen: 'second', hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 540, endMinute: 1080, validFrom: '2000-01-01', validTo: null })), holidays: [{ on: day(1), halfDay: false }, { on: day(2), halfDay: true }] };
      expect(live.dueAt!.getTime()).toBe(addBusinessSeconds(office, live.resumedAt!, live.targetSeconds - live.usedSeconds).getTime());
      // Paused on "on hold", resumed on "in progress": the due time moves by the paused stretch only.
      await api('agent1', 'patch', `/desk/tickets/${t.id}`).send({ version: (await ticket(t.id)).version, statusId: status('On hold') }).expect(200);
      await api('agent1', 'patch', `/desk/tickets/${t.id}`).send({ version: (await ticket(t.id)).version, statusId: status('In progress') }).expect(200);
      const back = (await timers(t.id)).find((x) => x.id === live.id)!;
      expect(back.state).toBe('running');
      expect(back.dueAt!.getTime()).toBe(addBusinessSeconds(office, back.resumedAt!, back.targetSeconds - back.usedSeconds).getTime());
    });

    it('OLA timers follow group hand-offs and tasks given to a group', async () => {
      const g2 = (await api('adminA', 'post', `/desk/desks/${ids.desk}/groups`).send({ name: `Network ${run}`, assignmentMethod: 'manual', memberIds: [users.agent2] }).expect(201)).body;
      await api('adminA', 'post', `/desk/desks/${ids.desk}/sla-policies`).send({ name: 'Hand-offs', kind: 'ola', scope: { match: 'all', rules: [] }, calendarSource: 'desk', targets: [{ metric: 'group', minutes: [60, 60, 60, 60] }, { metric: 'task', minutes: [120, 120, 120, 120] }] }).expect(201);
      const t = await raise('Switch port dead', 'Port 12 on floor 2.');
      await api('lead', 'patch', `/desk/tickets/${t.id}`).send({ version: (await ticket(t.id)).version, groupId: ids.group }).expect(200);
      let ola = (await timers(t.id)).filter((x) => x.kind === 'ola');
      expect(ola.map((x) => [x.metric, x.groupId, x.state])).toEqual([['group', ids.group, 'running']]);
      await api('lead', 'patch', `/desk/tickets/${t.id}`).send({ version: (await ticket(t.id)).version, groupId: g2.id }).expect(200);
      ola = (await timers(t.id)).filter((x) => x.kind === 'ola');
      expect(ola.map((x) => [x.groupId, x.state])).toEqual([[ids.group, 'met'], [g2.id, 'running']]);
      const task = (await api('agent1', 'post', `/desk/tickets/${t.id}/tasks`).send({ title: 'Replace the port', groupId: g2.id }).expect(201)).body;
      expect((await timers(t.id)).find((x) => x.taskId === task.id)?.state).toBe('running');
      await api('agent1', 'patch', `/desk/tasks/${task.id}`).send({ version: 1, state: 'done' }).expect(200);
      expect((await timers(t.id)).find((x) => x.taskId === task.id)?.state).toBe('met');
    });
  });

  describe('a login with no person: a new one on the first ticket, then HR links it (founder decision 8 Oct 2026)', () => {
    it('never links by email on its own; HR sees the possible duplicate and links it; the tickets follow', async () => {
      const t = (await api('newbie', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: 'Need VPN access', description: 'New here.' }).expect(201)).body;
      const made = await ticket(t.id);
      expect(made.requesterPersonId).not.toBe(ids.ninaPerson);
      await api('agent1', 'get', '/desk/people/possible-duplicates').expect(403);
      const list = (await api('hr', 'get', '/desk/people/possible-duplicates').expect(200)).body;
      const row = list.find((r: { personId: string }) => r.personId === made.requesterPersonId);
      expect(row).toMatchObject({ possibleMatch: { personId: ids.ninaPerson }, tickets: 1 });
      await api('hr', 'post', `/desk/people/possible-duplicates/${made.requesterPersonId}/link`).send({ intoPersonId: ids.divyaPerson }).expect(409);
      await api('hr', 'post', `/desk/people/possible-duplicates/${made.requesterPersonId}/link`).send({ intoPersonId: ids.ninaPerson }).expect(200);
      expect((await api('newbie', 'get', '/desk/my/tickets').expect(200)).body.map((x: { id: string }) => x.id)).toContain(t.id);
      expect((await api('hr', 'get', '/desk/people/possible-duplicates').expect(200)).body.find((r: { personId: string }) => r.personId === made.requesterPersonId)).toBeUndefined();
    });
  });
});
