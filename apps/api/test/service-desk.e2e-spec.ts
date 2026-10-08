process.env.SD_SCANNER = 'dev-fake';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { TicketsService } from '../src/service-desk/tickets.service';
import { EICAR_TEST_STRING } from '../src/service-desk/scanner';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// M14 Service Desk, phase 3b-1 batch 1 (SD-1.01 … SD-1.08), end to end against the real database (forced RLS, app
// role) and Redis: two companies kept apart, permission and seat checks on every route, the requester never seeing
// internal notes or files, attachments unavailable until scanned clean, and the assignment rules.
describe('Service Desk core (M14 §5–§7, §12.1, §14, §15)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let tickets: TicketsService;
  const fakeBlobs = createFakeBlobStorage();
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent1' | 'agent2' | 'lead' | 'collab' | 'deskAdmin' | 'divya' | 'outsider' | 'agentB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const asA = () => ({ organizationId: org.A.id, isSuperAdmin: false });
  const statusId = (label: string) => ids[`status:${label}`];

  /** Waits for the BullMQ scan worker to decide a file. */
  const scanned = async (attachmentId: string) => {
    for (let i = 0; i < 60; i++) {
      const row = await tenantPrisma.forTenant(asA(), (tx) => tx.sdAttachment.findFirst({ where: { id: attachmentId } }));
      if (row && row.scanStatus !== 'pending') return row.scanStatus;
      await new Promise((r) => setTimeout(r, 250));
    }
    return 'pending';
  };

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
    tickets = moduleRef.get(TicketsService);

    planId = (await prisma.plan.create({ data: { name: `sd-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Desk Org ${k}`, slug: `sd-${k.toLowerCase()}-${run}`, planId } });
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
      ['outsider', 'A', 'panel', 'desk_agent'],
      ['agentB', 'B', 'panel', 'desk_agent'],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@sd.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      const res = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@sd.test`, password: PASSWORD }).expect(200);
      token[who] = res.body.accessToken;
    }
    // Divya is an employee person with a login (P01 §4.5a); Arjun is a person without one.
    await tenantPrisma.forTenant(asA(), async (tx) => {
      ids.divyaPerson = (await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Divya', familyName: 'R', primaryEmail: `divya-person-${run}@sd.test` } })).id;
      await tx.personRole.create({ data: { organizationId: org.A.id, personId: ids.divyaPerson, roleType: 'login', sourceTable: 'users', sourceId: users.divya, startOn: new Date('2026-01-01') } });
      ids.arjunPerson = (await tx.person.create({ data: { organizationId: org.A.id, givenName: 'Arjun', primaryEmail: `arjun-${run}@sd.test` } })).id;
    });
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        // Desk rows go with their company (the cascade runs as the table owner).
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: all } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('desk set-up (SD-1.01, D4/D8/D11)', () => {
    it('a Service Desk admin creates an Employee help desk with its starter set-up; the kind never changes', async () => {
      const desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body;
      expect(desk).toMatchObject({ key: 'IT', kind: 'it', audience: 'employee', billingClass: 'service_desk', numberPrefix: 'IT-' });
      ids.desk = desk.id;
      const full = (await api('adminA', 'get', `/desk/desks/${desk.id}`).expect(200)).body;
      expect(full.types.map((t: { kind: string }) => t.kind).sort()).toEqual(['incident', 'question', 'request']);
      expect(full.statuses.map((s: { systemState: string }) => s.systemState)).toEqual(['new', 'open', 'pending', 'on_hold', 'solved', 'closed']);
      expect(full.matrix).toHaveLength(16);
      for (const s of full.statuses) ids[`status:${s.label}`] = s.id;
      ids.group = full.groups[0].id;
      ids.category = full.categories.find((c: { name: string }) => c.name === 'Access and accounts').id;
      ids.typeRequest = full.types.find((t: { kind: string }) => t.kind === 'request').id;
      ids.typeIncident = full.types.find((t: { kind: string }) => t.kind === 'incident').id;
      // Mass assignment: the system owns kind, billing class and the counter.
      await api('adminA', 'patch', `/desk/desks/${desk.id}`).send({ version: 1, kind: 'hr' }).expect(400);
      await api('adminA', 'patch', `/desk/desks/${desk.id}`).send({ version: 1, billingClass: 'hrms_included' }).expect(400);
      await expect(tenantPrisma.forTenant(asA(), (tx) => tx.sdDesk.update({ where: { id: desk.id }, data: { kind: 'hr' } }))).rejects.toThrow(/fixed when it is created/);
      // A customer support desk; an HR desk in a company without YukthiX HR is paid (§6.3 L4).
      expect((await api('adminA', 'post', '/desk/desks').send({ name: 'Customer care', key: 'CARE', kind: 'customer_support' }).expect(201)).body).toMatchObject({ audience: 'customer' });
      const hrDesk = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help desk', key: 'HR', kind: 'hr' }).expect(201)).body;
      expect(hrDesk.billingClass).toBe('service_desk');
      ids.hrDesk = hrDesk.id;
      await api('adminA', 'post', '/desk/desks').send({ name: 'Again', key: 'IT', kind: 'it' }).expect(409);
      await api('agent1', 'post', '/desk/desks').send({ name: 'Mine', key: 'MINE', kind: 'it' }).expect(403);
    });

    it('seats are dated, cost is shown first, and only desk members or set-up holders see the desk', async () => {
      const cost = (await api('adminA', 'get', `/desk/desks/${ids.desk}/members/cost?userId=${users.agent1}&role=agent`).expect(200)).body;
      expect(cost).toEqual({ paid: true, reason: 'Adds ₹999 a month (one agent).' });
      for (const [who, role] of [['agent1', 'agent'], ['agent2', 'agent'], ['lead', 'lead'], ['collab', 'collaborator'], ['deskAdmin', 'admin']] as const) {
        const res = (await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users[who], role }).expect(201)).body;
        ids[`member:${who}`] = res.id;
      }
      expect((await api('adminA', 'get', `/desk/desks/${ids.desk}/members/cost?userId=${users.collab}&role=collaborator`).expect(200)).body.paid).toBe(false);
      await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users.agent1, role: 'lead' }).expect(409);
      // A user of company B is not a person of company A.
      await api('adminA', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users.adminB, role: 'agent' }).expect(400);
      await api('adminA', 'patch', `/desk/desks/${ids.desk}/groups/${ids.group}`).send({ name: 'IT help desk team', assignmentMethod: 'round_robin', memberIds: [users.agent1, users.agent2] }).expect(200);
      // Group members need an agent seat.
      await api('adminA', 'patch', `/desk/desks/${ids.desk}/groups/${ids.group}`).send({ name: 'IT help desk team', assignmentMethod: 'round_robin', memberIds: [users.collab] }).expect(400);
      await api('outsider', 'get', `/desk/desks/${ids.desk}`).expect(404);
      await api('agent1', 'patch', `/desk/desks/${ids.desk}`).send({ version: 1, name: 'x' }).expect(403);
      expect((await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: 1, numberSuffix: '' }).expect(200)).body.version).toBe(2);
      // Stale version.
      await api('deskAdmin', 'patch', `/desk/desks/${ids.desk}`).send({ version: 1, name: 'x' }).expect(409);
      const audit = await tenantPrisma.forTenant(asA(), (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: 'desk.' } } }));
      expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(['desk.desk.created', 'desk.member.added', 'desk.group.updated', 'desk.desk.updated']));
    });
  });

  describe('business calendars (SD-1.02)', () => {
    it('hours change from a date without rewriting the past; zones are checked', async () => {
      const cals = (await api('adminA', 'get', '/desk/calendars').expect(200)).body;
      expect(cals[0]).toMatchObject({ name: 'Office hours', timeZone: 'Asia/Kolkata' });
      await api('adminA', 'post', '/desk/calendars').send({ name: 'Night', timeZone: 'Mars/Base', hours: [] }).expect(400);
      const night = (await api('adminA', 'post', '/desk/calendars').send({ name: 'Night shift', timeZone: 'Asia/Kolkata', hours: [{ weekday: 1, startMinute: 1320, endMinute: 1440 }], holidays: [{ on: '2026-12-25', name: 'Christmas' }] }).expect(201)).body;
      await api('adminA', 'put', `/desk/calendars/${night.id}/hours`).send({ effectiveFrom: '2020-01-01', hours: [] }).expect(400);
      await api('adminA', 'put', `/desk/calendars/${night.id}/hours`).send({ effectiveFrom: '2099-01-01', hours: [{ weekday: 2, startMinute: 0, endMinute: 120 }, { weekday: 2, startMinute: 60, endMinute: 180 }] }).expect(409);
      await expect(tenantPrisma.forTenant(asA(), (tx) => tx.businessCalendarHours.updateMany({ where: { calendarId: night.id }, data: { startMinute: 0 } }))).rejects.toThrow(/never rewritten/);
      await api('agent1', 'post', '/desk/calendars').send({ name: 'x', timeZone: 'UTC', hours: [] }).expect(403);
    });
  });

  describe('tickets, requesters and assignment (SD-1.03, 1.04, 1.06)', () => {
    it('a requester raises a ticket: numbered, routed, assigned round-robin, events and audit written', async () => {
      const raised = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: ids.category, subject: 'Cannot open the shared drive', description: 'Access denied <script>alert(1)</script>', impact: 2, urgency: 2 }).expect(201)).body;
      expect(raised.number).toBe('IT-1001');
      ids.t1 = raised.id;
      const t = await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: raised.id } }));
      expect(t).toMatchObject({ systemState: 'new', kind: 'incident', priority: 2, channel: 'portal', requesterPersonId: ids.divyaPerson, groupId: ids.group });
      expect([users.agent1, users.agent2]).toContain(t.assigneeUserId);
      const second = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: ids.category, subject: 'Second', description: 'Two' }).expect(201)).body;
      ids.t2 = second.id;
      const t2 = await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: second.id } }));
      expect(t2.assigneeUserId).not.toBe(t.assigneeUserId);
      const outbox = await tenantPrisma.forTenant(asA(), (tx) => tx.eventOutbox.findMany({ where: { organizationId: org.A.id, eventType: 'helpdesk.ticket.created' } }));
      expect(outbox.length).toBeGreaterThanOrEqual(2);
      const mine = (await api('divya', 'get', '/desk/my/tickets').expect(200)).body;
      expect(mine.map((x: { number: string }) => x.number)).toEqual(expect.arrayContaining(['IT-1001', 'IT-1002']));
      // The description was cleaned (§14.2).
      const view = (await api('divya', 'get', `/desk/my/tickets/${ids.t1}`).expect(200)).body;
      expect(view.messages[0].bodyHtml).not.toMatch(/<script/);
      // Raising for someone outside one's team needs request.raise_on_behalf.
      await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: 'For Arjun', description: 'x', requestedForPersonId: ids.arjunPerson }).expect(403);
      // Customer support desks are not raised to from the employee portal.
      const care = (await api('adminA', 'get', '/desk/desks').expect(200)).body.find((d: { key: string }) => d.key === 'CARE');
      await api('divya', 'post', '/desk/my/tickets').send({ deskId: care.id, subject: 'x', description: 'y' }).expect(404);
    });

    it('assignment skips away agents, load picks the fewest open, manual assigns nobody', async () => {
      const assignee = async (subject: string) => {
        const r = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: ids.category, subject, description: 'x' }).expect(201)).body;
        return (await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: r.id } }))).assigneeUserId;
      };
      await api('agent2', 'put', '/desk/me/status').send({ status: 'away' }).expect(200);
      expect(await assignee('While agent2 is away')).toBe(users.agent1);
      expect(await assignee('Still away')).toBe(users.agent1);
      await api('agent2', 'put', '/desk/me/status').send({ status: 'available' }).expect(200);
      // Off shift: a shift that never covers now.
      const now = new Date();
      const minute = (now.getUTCHours() * 60 + now.getUTCMinutes() + 180) % 1440;
      await api('agent1', 'put', '/desk/me/status').send({ status: 'available', shiftStartMinute: minute, shiftEndMinute: (minute + 60) % 1440 || 1, shiftTimeZone: 'UTC', shiftDays: [1, 2, 3, 4, 5, 6, 7] }).expect(200);
      expect(await assignee('agent1 off shift')).toBe(users.agent2);
      await api('agent1', 'put', '/desk/me/status').send({ status: 'available', shiftStartMinute: null, shiftEndMinute: null, shiftTimeZone: null }).expect(200);
      await api('adminA', 'patch', `/desk/desks/${ids.desk}/groups/${ids.group}`).send({ name: 'IT help desk team', assignmentMethod: 'load' }).expect(200);
      const open = await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.groupBy({ by: ['assigneeUserId'], where: { deskId: ids.desk, systemState: { in: ['new', 'open'] } }, _count: { _all: true } }));
      const count = (u: string) => open.find((o) => o.assigneeUserId === u)?._count._all ?? 0;
      expect(await assignee('By load')).toBe(count(users.agent1) <= count(users.agent2) ? users.agent1 : users.agent2);
      await api('adminA', 'patch', `/desk/desks/${ids.desk}/groups/${ids.group}`).send({ name: 'IT help desk team', assignmentMethod: 'manual' }).expect(200);
      expect(await assignee('Manual')).toBeNull();
      // Collaborators cannot set an away status (they get no tickets).
      await api('collab', 'put', '/desk/me/status').send({ status: 'away' }).expect(403);
    });

    it('only an agent seat owns a ticket: collaborators get DESK_AGENT_SEAT_REQUIRED, and the database refuses too', async () => {
      // A collaborator holds no work key at all (the guard refuses); an agent cannot hand a ticket to a collaborator.
      await api('collab', 'post', `/desk/tickets/${ids.t1}/assign`).send({ userId: users.collab }).expect(403);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/assign`).send({ userId: users.collab }).expect(403);
      // An agent takes a ticket; giving it to someone else is a lead's.
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/assign`).send({ userId: users.agent1 }).expect(200);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/assign`).send({ userId: users.agent2 }).expect(403);
      await api('lead', 'post', `/desk/tickets/${ids.t1}/assign`).send({ userId: users.agent2 }).expect(200);
      await api('lead', 'post', `/desk/tickets/${ids.t1}/assign`).send({ userId: users.agent1 }).expect(200);
      await expect(tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.update({ where: { id: ids.t1 }, data: { assigneeUserId: users.collab } }))).rejects.toThrow(/DESK_AGENT_SEAT_REQUIRED/);
      await expect(
        tenantPrisma.forTenant(asA(), (tx) => tx.sdTicketMessage.create({ data: { organizationId: org.A.id, deskId: ids.desk, ticketId: ids.t1, kind: 'reply', side: 'agent', authorUserId: users.collab, bodyHtml: '<p>x</p>', bodyText: 'x', channel: 'agent' } })),
      ).rejects.toThrow(/DESK_AGENT_SEAT_REQUIRED/);
    });

    it('updates are version-checked, status and priority changes are logged, conversion keeps history', async () => {
      const t = (await api('agent1', 'get', `/desk/tickets/${ids.t1}`).expect(200)).body;
      expect(t).toMatchObject({ access: 'agent', canWork: true, number: 'IT-1001' });
      await api('agent1', 'patch', `/desk/tickets/${ids.t1}`).send({ version: t.version, priority: 1 }).expect(400);
      const up = (await api('agent1', 'patch', `/desk/tickets/${ids.t1}`).send({ version: t.version, priority: 1, priorityReason: 'Whole team blocked', statusId: statusId('In progress'), tags: ['drive', 'access'] }).expect(200)).body;
      expect(up).toMatchObject({ priority: 1, systemState: 'open', tags: ['drive', 'access'], version: t.version + 1 });
      const stale = await api('agent2', 'patch', `/desk/tickets/${ids.t1}`).send({ version: t.version, subject: 'x' }).expect(409);
      expect(stale.body).toMatchObject({ code: 'TICKET_CHANGED', message: expect.stringMatching(/agent1 .* changed this ticket/) });
      // Mass assignment: the number, system state and desk are never accepted.
      await api('agent1', 'patch', `/desk/tickets/${ids.t1}`).send({ version: up.version, number: 'X-1' }).expect(400);
      await api('agent1', 'patch', `/desk/tickets/${ids.t1}`).send({ version: up.version, systemState: 'closed' }).expect(400);
      await api('agent1', 'patch', `/desk/tickets/${ids.t1}`).send({ version: up.version, deskId: ids.hrDesk }).expect(400);
      // A status of another desk is refused.
      const hrStatus = (await api('adminA', 'get', `/desk/desks/${ids.hrDesk}`).expect(200)).body.statuses[0].id;
      await api('agent1', 'patch', `/desk/tickets/${ids.t1}`).send({ version: up.version, statusId: hrStatus }).expect(400);
      const conv = (await api('agent1', 'post', `/desk/tickets/${ids.t1}/convert`).send({ typeId: ids.typeRequest, reason: 'It is an access request' }).expect(200)).body;
      expect(conv.kind).toBe('request');
      const timeline = (await api('agent1', 'get', `/desk/tickets/${ids.t1}/timeline`).expect(200)).body.map((e: { kind: string }) => e.kind);
      expect(timeline).toEqual(expect.arrayContaining(['created', 'assigned', 'priority_changed', 'status_changed', 'tags_changed', 'type_changed']));
    });
  });

  describe('workspace: replies, notes, mentions, privacy (SD-1.08, YX-SD-13)', () => {
    it('agents reply with cleaned rich text; notes and mentions stay internal; the requester never sees a note', async () => {
      const reply = (await api('agent1', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'reply', bodyHtml: '<p>Try again now <img src=x onerror=alert(1)><a href="javascript:alert(1)">here</a></p>', statusId: statusId('Waiting on requester') }).expect(201)).body;
      expect(reply.ticket.systemState).toBe('pending');
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'reply', bodyHtml: '<p>x</p>', mentions: [users.lead] }).expect(400);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'note', bodyHtml: '<p>SECRET-NOTE password is in the vault</p>', mentions: [users.collab] }).expect(201);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'note', bodyHtml: '<p>x</p>', mentions: [users.outsider] }).expect(400);
      const agentView = (await api('agent1', 'get', `/desk/tickets/${ids.t1}`).expect(200)).body;
      const sent = agentView.messages.find((m: { id: string }) => m.id === reply.id);
      expect(sent.bodyHtml).not.toMatch(/onerror|javascript:|<img/);
      expect(agentView.collaborators.map((c: { userId: string }) => c.userId)).toContain(users.collab);
      const bell = await tenantPrisma.forTenant(asA(), (tx) => tx.userNotification.findMany({ where: { recipientUserId: users.collab, type: 'helpdesk.note.mention' } }));
      expect(bell).toHaveLength(1);
      const mine = (await api('divya', 'get', `/desk/my/tickets/${ids.t1}`).expect(200)).body;
      expect(JSON.stringify(mine)).not.toMatch(/SECRET-NOTE/);
      expect(mine.messages.every((m: { side: string }) => m.side !== 'note')).toBe(true);
      expect(mine).not.toHaveProperty('tags');
      // The requester replies: the ticket goes back to work.
      await api('divya', 'post', `/desk/my/tickets/${ids.t1}/messages`).send({ text: 'Still denied' }).expect(201);
      expect((await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.t1 } }))).systemState).toBe('open');
    });

    it('a collaborator sees only the tickets they are on, adds notes, never replies or works', async () => {
      const list = (await api('collab', 'get', '/desk/tickets').expect(200)).body;
      expect(list.items.map((t: { id: string }) => t.id)).toEqual([ids.t1]);
      await api('collab', 'get', `/desk/tickets/${ids.t2}`).expect(404);
      const view = (await api('collab', 'get', `/desk/tickets/${ids.t1}`).expect(200)).body;
      expect(view).toMatchObject({ access: 'collaborator', canWork: false, canNote: true });
      await api('collab', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'note', bodyHtml: '<p>Checked the group</p>' }).expect(201);
      expect((await api('collab', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'reply', bodyHtml: '<p>hi</p>' }).expect(403)).body.code).toBe('DESK_AGENT_SEAT_REQUIRED');
      await api('collab', 'patch', `/desk/tickets/${ids.t1}`).send({ version: 99, subject: 'x' }).expect(403);
      await api('collab', 'post', `/desk/tickets/${ids.t1}/time-entries`).send({ minutes: 5 }).expect(403);
    });

    it('sensitive and private tickets: agents of the desk only, never a desk admin, company admin or another desk', async () => {
      const full = (await api('adminA', 'get', `/desk/desks/${ids.desk}`).expect(200)).body;
      const sens = (await api('adminA', 'post', `/desk/desks/${ids.desk}/categories`).send({ name: 'Security incident', sensitive: true, defaultGroupId: full.groups[0].id }).expect(201)).body;
      const s = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: sens.id, subject: 'Phishing mail', description: 'x' }).expect(201)).body;
      const p = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.desk, categoryId: ids.category, subject: 'Private matter', description: 'x', private: true }).expect(201)).body;
      for (const id of [s.id, p.id]) {
        await api('agent2', 'get', `/desk/tickets/${id}`).expect(200);
        await api('deskAdmin', 'get', `/desk/tickets/${id}`).expect(404);
        await api('adminA', 'get', `/desk/tickets/${id}`).expect(403);
        await api('outsider', 'get', `/desk/tickets/${id}`).expect(404);
        await api('divya', 'get', `/desk/my/tickets/${id}`).expect(200);
      }
      const adminList = (await api('deskAdmin', 'get', '/desk/tickets').expect(200)).body.items.map((t: { id: string }) => t.id);
      expect(adminList).toContain(ids.t2);
      expect(adminList).not.toContain(s.id);
      expect(adminList).not.toContain(p.id);
      // The System Admin sets desks up but holds no ticket key and no seat.
      await api('adminA', 'get', '/desk/tickets').expect(403);
      // The child rows carry the ticket's flags for the SD-1.12 database policy.
      const msgs = await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicketMessage.findMany({ where: { ticketId: { in: [s.id, p.id] } } }));
      expect(msgs.every((m) => m.sensitive || m.private)).toBe(true);
    });

    it('time is logged with the agent; presence shows who else is on the ticket', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/time-entries`).send({ minutes: 25, note: 'Checked AD groups' }).expect(201);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/time-entries`).send({ minutes: 0 }).expect(400);
      expect((await api('agent1', 'get', `/desk/tickets/${ids.t1}`).expect(200)).body.time.totalMinutes).toBe(25);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/presence`).send({ typing: true }).expect(200);
      const others = (await api('agent2', 'post', `/desk/tickets/${ids.t1}/presence`).send({ typing: false }).expect(200)).body;
      expect(others).toEqual([expect.objectContaining({ userId: users.agent1, typing: true })]);
      await api('outsider', 'post', `/desk/tickets/${ids.t1}/presence`).send({ typing: false }).expect(404);
      const ctx = (await api('agent1', 'get', `/desk/tickets/${ids.t1}/context`).expect(200)).body;
      expect(ctx.person.name).toBe('Divya R');
      expect(ctx.otherTickets.length).toBeGreaterThan(0);
    });
  });

  describe('attachments (SD-1.05, §14.2)', () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

    it('allowed type, real bytes, scanned before anyone can open it; internal files never reach the requester', async () => {
      const up = (await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments`).attach('file', pdf, 'steps.pdf').expect(201)).body;
      expect(up.scanStatus).toBe('pending');
      expect(await scanned(up.id)).toBe('clean');
      const link = (await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments/${up.id}/link`).expect(200)).body;
      const file = await request(server()).get(`/api/v1${link.url}`).expect(200);
      expect(file.headers['content-disposition']).toMatch(/^attachment; filename\*=UTF-8''steps.pdf/);
      expect(file.headers['x-content-type-options']).toBe('nosniff');
      await request(server()).get('/api/v1/desk/files/not-a-token').expect(404);
      // Not yet sent with a reply: hidden from the requester.
      expect((await api('divya', 'get', `/desk/my/tickets/${ids.t1}`).expect(200)).body.attachments.map((x: { id: string }) => x.id)).not.toContain(up.id);
      await api('divya', 'post', `/desk/my/tickets/${ids.t1}/attachments/${up.id}/link`).expect(404);
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'reply', bodyHtml: '<p>Steps attached</p>', attachmentIds: [up.id] }).expect(201);
      await api('divya', 'post', `/desk/my/tickets/${ids.t1}/attachments/${up.id}/link`).expect(200);
      // A file on a note stays internal.
      const internal = (await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments`).attach('file', pdf, 'internal.pdf').expect(201)).body;
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'note', bodyHtml: '<p>log</p>', attachmentIds: [internal.id] }).expect(201);
      await api('divya', 'post', `/desk/my/tickets/${ids.t1}/attachments/${internal.id}/link`).expect(404);
      // Someone else's or an already sent file cannot be attached again.
      await api('agent2', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'reply', bodyHtml: '<p>x</p>', attachmentIds: [internal.id] }).expect(400);
    });

    it('refuses types off the list, renamed files and infected files', async () => {
      await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments`).attach('file', Buffer.from('MZ\x90\x00\x03\x00\x00\x00'), 'invoice.exe').expect(400);
      const renamed = await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments`).attach('file', Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff'), 'invoice.pdf').expect(400);
      expect(renamed.body.message).toMatch(/does not match its name/);
      const eicar = (await api('divya', 'post', `/desk/my/tickets/${ids.t1}/attachments`).attach('file', Buffer.from(EICAR_TEST_STRING), 'test.txt').expect(201)).body;
      expect(await scanned(eicar.id)).toBe('infected');
      expect((await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments/${eicar.id}/link`).expect(410)).body.code).toBe('FILE_BLOCKED');
      // A pending file cannot be opened (fail closed).
      const row = await tenantPrisma.forTenant(asA(), (tx) => tx.sdAttachment.create({ data: { organizationId: org.A.id, deskId: ids.desk, ticketId: ids.t1, side: 'agent', uploadedByUserId: users.agent1, blobKey: 'x', fileName: 'p.pdf', contentType: 'application/pdf', sizeBytes: 1, sha256: '0'.repeat(64) } }));
      expect((await api('agent1', 'post', `/desk/tickets/${ids.t1}/attachments/${row.id}/link`).expect(409)).body.code).toBe('FILE_NOT_SCANNED');
    });
  });

  describe('lists, views, bulk, scenarios, export (SD-1.07)', () => {
    it('filters, saved views, bulk by a lead only, scenarios, and a CSV without formulas', async () => {
      const filtered = (await api('agent1', 'get', `/desk/tickets?assignee=me&states=new,open,pending&search=shared`).expect(200)).body;
      expect(filtered.items.map((t: { id: string }) => t.id)).toContain(ids.t1);
      const view = (await api('agent1', 'post', '/desk/views').send({ name: 'Mine', deskId: ids.desk, filters: { assignee: 'me' } }).expect(201)).body;
      expect((await api('agent1', 'get', `/desk/tickets?viewId=${view.id}`).expect(200)).body.items.length).toBeGreaterThan(0);
      await api('agent2', 'get', `/desk/tickets?viewId=${view.id}`).expect(404);
      await api('agent1', 'post', '/desk/views').send({ name: 'Team', deskId: ids.desk, shared: true, filters: {} }).expect(403);
      await api('lead', 'post', '/desk/views').send({ name: 'Team', deskId: ids.desk, shared: true, filters: { states: ['new'] } }).expect(201);
      expect((await api('agent2', 'get', '/desk/views').expect(200)).body.map((v: { name: string }) => v.name)).toContain('Team');

      await api('agent1', 'post', '/desk/tickets/bulk').send({ ticketIds: [ids.t2], action: { addTags: ['x'] } }).expect(403);
      const bulk = (await api('lead', 'post', '/desk/tickets/bulk').send({ ticketIds: [ids.t2, randomUUID()], action: { addTags: ['=cmd|x'] } }).expect(400));
      expect(bulk.body.message).toBeDefined();
      const ok = (await api('lead', 'post', '/desk/tickets/bulk').send({ ticketIds: [ids.t2, randomUUID()], action: { addTags: ['batch'], priority: 4, priorityReason: 'Not urgent' } }).expect(200)).body;
      expect(ok).toEqual({ done: [ids.t2], failed: [expect.objectContaining({ reason: 'No such ticket.' })] });

      const sc = (await api('adminA', 'post', `/desk/desks/${ids.desk}/scenarios`).send({ name: 'Ask for details', actions: { statusId: statusId('Waiting on requester'), reply: '<p>Please send a screenshot</p>', addTags: ['need-info'] } }).expect(201)).body;
      const t2 = (await api('agent1', 'get', `/desk/tickets/${ids.t2}`).expect(200)).body;
      const ran = (await api('agent1', 'post', `/desk/tickets/${ids.t2}/scenarios/${sc.id}`).send({ version: t2.version }).expect(200)).body;
      expect(ran).toMatchObject({ systemState: 'pending', tags: expect.arrayContaining(['need-info', 'batch']) });

      await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.update({ where: { id: ids.t2 }, data: { subject: '=HYPERLINK("http://evil.test")' } }));
      const csv = (await api('agent1', 'get', '/desk/tickets/export').expect(200)).text;
      expect(csv).toMatch(/^Number,Subject/);
      expect(csv).toContain(`"'=HYPERLINK(""http://evil.test"")"`);
      await api('collab', 'get', '/desk/tickets/export').expect(403);
      const exported = await tenantPrisma.forTenant(asA(), (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.ticket.exported' } }));
      expect(exported).toBe(1);
    });
  });

  describe('company isolation (forced RLS, §5.1, §15.1)', () => {
    it("company B's admin and agents never reach company A's desks, tickets or files", async () => {
      expect((await api('adminB', 'get', '/desk/desks').expect(200)).body).toEqual([]);
      await api('adminB', 'get', `/desk/desks/${ids.desk}`).expect(404);
      await api('adminB', 'patch', `/desk/desks/${ids.desk}`).send({ version: 2, name: 'Hijack' }).expect(404);
      await api('adminB', 'post', `/desk/desks/${ids.desk}/members`).send({ userId: users.agentB, role: 'agent' }).expect(404);
      const deskB = (await api('adminB', 'post', '/desk/desks').send({ name: 'IT', key: 'IT', kind: 'it' }).expect(201)).body;
      await api('adminB', 'post', `/desk/desks/${deskB.id}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
      await api('agentB', 'get', `/desk/tickets/${ids.t1}`).expect(404);
      expect((await api('agentB', 'get', '/desk/tickets').expect(200)).body.items).toEqual([]);
      await api('agentB', 'post', `/desk/tickets/${ids.t1}/messages`).send({ kind: 'reply', bodyHtml: '<p>x</p>' }).expect(404);
      // Raising into company A's desk from company B.
      await api('agentB', 'post', '/desk/my/tickets').send({ deskId: ids.desk, subject: 'x', description: 'y' }).expect(404);
      // At the database: B's session reads none of A's desk rows and cannot write into A.
      const asB = { organizationId: org.B.id, isSuperAdmin: false };
      const counts = await tenantPrisma.forTenant(asB, async (tx) => [
        await tx.sdDesk.count({ where: { organizationId: org.A.id } }),
        await tx.sdTicket.count({ where: { organizationId: org.A.id } }),
        await tx.sdTicketMessage.count({ where: { organizationId: org.A.id } }),
        await tx.sdAttachment.count({ where: { organizationId: org.A.id } }),
        await tx.sdDeskMember.count({ where: { organizationId: org.A.id } }),
        await tx.businessCalendar.count({ where: { organizationId: org.A.id } }),
        await tx.eventOutbox.count({ where: { organizationId: org.A.id } }),
      ]);
      expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0]);
      await expect(tenantPrisma.forTenant(asB, (tx) => tx.sdTicketEvent.create({ data: { organizationId: org.A.id, deskId: ids.desk, ticketId: ids.t1, kind: 'created' } }))).rejects.toThrow();
      // B's numbers start on their own (IT-1001 in each company).
      const raisedB = (await api('agentB', 'post', '/desk/tickets').send({ deskId: deskB.id, requesterPersonId: ids.arjunPerson, subject: 'x', bodyHtml: '<p>y</p>' }).expect(400)).body;
      expect(raisedB.message).toMatch(/No such person/);
    });

    it('every desk table has forced row-level security with the tenant policy', async () => {
      const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
        SELECT c.relname, c.relforcerowsecurity AS forced,
               EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND (c.relname LIKE 'sd\\_%' OR c.relname LIKE 'business\\_calendar%' OR c.relname = 'event_outbox')`;
      expect(rows.length).toBeGreaterThanOrEqual(25);
      expect(rows.filter((r) => !r.forced || !r.policy)).toEqual([]);
    });
  });

  describe('seats end cleanly', () => {
    it('ending an agent seat hands their open tickets back to the queue and stops their access', async () => {
      await api('adminA', 'delete', `/desk/desks/${ids.desk}/members/${ids['member:agent2']}`).expect(200);
      expect(await tenantPrisma.forTenant(asA(), (tx) => tx.sdTicket.count({ where: { deskId: ids.desk, assigneeUserId: users.agent2, systemState: { in: ['new', 'open', 'pending'] } } }))).toBe(0);
      await api('agent2', 'get', `/desk/tickets/${ids.t1}`).expect(404);
      void tickets;
    });
  });
});
