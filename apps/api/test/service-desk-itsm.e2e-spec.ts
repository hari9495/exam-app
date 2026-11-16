process.env.SD_SCANNER = 'dev-fake';
process.env.APPROVAL_CHANNELS = 'dev-fake';
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
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import { ChangesService } from '../src/service-desk/changes.service';
import { RecurringService } from '../src/service-desk/recurring.service';

// Helpdesk ITSM (docs/yukthix/helpdesk-itsm-plan.md; answers 1931-1943). ITSM-1: change and problem are ticket kinds on
// IT desks only, never raised as tickets or by requesters; the desk's change settings and the company's change window,
// each with its default. Positive and negative; one company never sees another's.
describe('Helpdesk ITSM: changes and problems', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let engine: ApprovalsEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agentB' | 'agent' | 'lead' | 'lead2' | 'deskAdmin' | 'owner' | 'board1' | 'board2' | 'divya';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const people = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; requestId: string; title: string }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  const taskFor = async (who: Who, number: string) => (await inbox(who)).find((x) => x.title.startsWith(`${number}:`));
  const change = (id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.sdChange.findFirstOrThrow({ where: { id } }));
  // Days in India time against org A's window after the ITSM-1 test: weekdays 21:00-06:00 and weekends; freeze on the
  // first 7 and last 2 days and on the 7th and 15th.
  const istParts = (d: Date) => {
    const x = new Date(d.getTime() + 330 * 60_000);
    return { dow: x.getUTCDay(), day: x.getUTCDate(), last: new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate(), iso: x.toISOString().slice(0, 10) };
  };
  const frozen = (p: ReturnType<typeof istParts>) => p.day <= 7 || p.day > p.last - 2 || [7, 15].includes(p.day);
  const nextDay = (ok: (p: ReturnType<typeof istParts>) => boolean) => {
    for (let i = 1; i < 200; i++) {
      const p = istParts(new Date(Date.now() + i * 86_400_000));
      if (ok(p)) return p.iso;
    }
    throw new Error('no such day');
  };
  const at = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00+05:30`).toISOString();
  const LOW = { people: '0', undo: '0', tested: '0', before: '0', money: '0' };
  const MEDIUM = { people: '1', undo: '1', tested: '1', before: '0', money: '0' };
  const HIGH = { people: '2', undo: '2', tested: '2', before: '2', money: '2' };
  const typeOf = async (deskId: string, kind: string) => ((await api('adminA', 'get', `/desk/desks/${deskId}`).expect(200)).body.types as { id: string; kind: string }[]).find((t) => t.kind === kind)?.id;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn().mockResolvedValue({ success: true }) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    engine = moduleRef.get(ApprovalsEngine);

    planId = (await prisma.plan.create({ data: { name: `itsm-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ITSM Org ${k}`, slug: `itsm-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agentB', 'B', 'panel', 'desk_agent'],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_agent'],
      ['lead2', 'A', 'panel', 'desk_agent'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['owner', 'A', 'panel', null],
      ['board1', 'A', 'panel', null],
      ['board2', 'A', 'panel', null],
      ['divya', 'A', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}-${run}@itsm.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}-${run}@itsm.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      for (const who of ['divya', 'agent'] as const) {
        const p = await tx.person.create({ data: { organizationId: org.A.id, givenName: who, primaryEmail: `${who}-${run}@itsm.test` } });
        await tx.personRole.create({ data: { organizationId: org.A.id, personId: p.id, roleType: 'login', sourceTable: 'users', sourceId: users[who], startOn: new Date('2026-01-01') } });
        people[who] = p.id;
      }
    });
    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.hr = (await api('adminA', 'post', '/desk/desks').send({ name: 'HR help desk', key: 'HR', kind: 'hr' }).expect(201)).body.id;
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.agent, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.lead, role: 'lead' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.lead2, role: 'lead' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users.deskAdmin, role: 'admin' }).expect(201);
    ids.itB = (await api('adminB', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body.id;
    await api('adminB', 'post', `/desk/desks/${ids.itB}/members`).send({ userId: users.agentB, role: 'agent' }).expect(201);
  }, 240_000);

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

  // ------------------------------------------------------------------------------------------------ ITSM-1

  it('an IT desk has Change and Problem types; other desks do not and cannot add them', async () => {
    ids.changeType = (await typeOf(ids.it, 'change'))!;
    ids.problemType = (await typeOf(ids.it, 'problem'))!;
    expect(ids.changeType && ids.problemType).toBeTruthy();
    expect(await typeOf(ids.hr, 'change')).toBeUndefined();
    const bad = await api('adminA', 'post', `/desk/desks/${ids.hr}/ticket-types`).send({ name: 'Change', kind: 'change' }).expect(400);
    expect(bad.body.message).toMatch(/IT desks only/);
    await api('adminA', 'post', `/desk/desks/${ids.it}/ticket-types`).send({ name: 'Network change', kind: 'change' }).expect(201);
  });

  it('requesters never see or raise changes; agents cannot raise one as a ticket or turn a ticket into one', async () => {
    const mine = (await api('divya', 'get', '/desk/my/desks').expect(200)).body as { id: string; types: { id: string }[] }[];
    const it = mine.find((d) => d.id === ids.it)!;
    expect(it.types.map((t) => t.id)).not.toContain(ids.changeType);
    expect(it.types.map((t) => t.id)).not.toContain(ids.problemType);
    const raise = await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, typeId: ids.changeType, subject: 'Please upgrade the VPN', description: 'Tonight.' }).expect(400);
    expect(raise.body.message).toMatch(/Changes and problems are raised from/);
    expect((await api('agent', 'post', '/desk/tickets').send({ deskId: ids.it, typeId: ids.problemType, requesterPersonId: people.divya, subject: 'Repeat outage', bodyHtml: '<p>x</p>' }).expect(400)).body.message).toMatch(/raised from/);
    // A ticket raised without a type never lands on Change (its type list starts with the employee types).
    const t = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'VPN keeps dropping', description: 'Since Monday.' }).expect(201)).body;
    ids.incident = t.id;
    const row = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id }, select: { kind: true } }));
    expect(['incident', 'request', 'question']).toContain(row.kind);
    const conv = await api('agent', 'post', `/desk/tickets/${t.id}/convert`).send({ typeId: ids.changeType, reason: 'It is a change' }).expect(400);
    expect(conv.body.message).toMatch(/keeps its type/);
    // "Fixes" is only from a change to a problem.
    const other = (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: 'Printer jam', description: 'Floor 2.' }).expect(201)).body;
    await api('agent', 'post', `/desk/tickets/${t.id}/links`).send({ ticketId: other.id, kind: 'fixes' }).expect(400);
  });

  it('desk settings: defaults, saved by the desk admin with a version, refused for others and for other companies', async () => {
    const s = (await api('agent', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(200)).body;
    expect([s.routeLow, s.routeMedium, s.routeHigh, s.boardRule, s.emergencyReviewDays, s.bannerHours, s.reviewDays, s.repeatCount, s.repeatDays, s.version]).toEqual(['lead', 'lead_owner', 'board', 'majority', 2, 24, 5, 3, 7, 0]);
    expect(s.riskQuestions).toHaveLength(5);
    expect([s.canEdit, s.window.weekdayFrom, s.window.weekdayTo, s.window.freezeDates]).toEqual([false, '20:00', '06:00', [7, 15, 20]]);
    await api('agent', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, reviewDays: 3 }).expect(403);
    // The board route needs a board.
    const noBoard = await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, reviewDays: 3 }).expect(400);
    expect(noBoard.body.message).toMatch(/change board/);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, boardUserIds: [users.adminB] }).expect(400);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, riskQuestions: [{ id: 'x', label: 'Too short?', options: [{ value: '5', label: 'a' }, { value: '0', label: 'b' }] }] }).expect(400);
    const saved = (await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, boardUserIds: [users.board1, users.board2, users.lead], reviewDays: 4 }).expect(200)).body;
    expect([saved.version, saved.reviewDays, saved.board.length]).toEqual([1, 4, 3]);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 0, reviewDays: 6 }).expect(409);
    await api('adminA', 'put', `/desk/desks/${ids.hr}/itsm-settings`).send({ version: 0, reviewDays: 6 }).expect(400);
    await api('adminB', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(404);
    await api('adminB', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: 1, reviewDays: 6 }).expect(404);
    expect((await api('adminB', 'get', `/desk/desks/${ids.itB}/itsm-settings`).expect(200)).body.version).toBe(0);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.itsm.settings_changed' } }))).toBe(1);
  });

  it('the company change window: only the Service Desk owner changes it; bad dates are refused; one company only', async () => {
    await api('deskAdmin', 'put', '/desk/itsm/window').send({ weekdayFrom: '21:00' }).expect(403);
    await api('adminA', 'put', '/desk/itsm/window').send({ freezeDates: '7, 40' }).expect(400);
    await api('adminA', 'put', '/desk/itsm/window').send({ weekdayFrom: '21:15' }).expect(400);
    await api('adminA', 'put', '/desk/itsm/window').send({ weekdayFrom: '06:00' }).expect(400);
    const w = (await api('adminA', 'put', '/desk/itsm/window').send({ weekdayFrom: '21:00', freezeDates: '15, 7', freezeLastDays: 2 }).expect(200)).body.window;
    expect([w.weekdayFrom, w.freezeDates, w.freezeLastDays, w.freezeFirstDays]).toEqual(['21:00', [7, 15], 2, 7]);
    expect((await api('agent', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(200)).body.window.weekdayFrom).toBe('21:00');
    expect((await api('adminB', 'get', `/desk/desks/${ids.itB}/itsm-settings`).expect(200)).body.window.weekdayFrom).toBe('20:00');
  });

  // ------------------------------------------------------------------------------------------------ ITSM-2

  it('only IT agents and leads raise changes; the risk sets the approval route; nobody approves their own change', async () => {
    ids.tally = (await api('adminA', 'post', '/desk/apps').send({ name: 'Tally Prime', ownerUserId: users.owner }).expect(201)).body.id;
    const sat = nextDay((p) => p.dow === 6 && !frozen(p));
    const base = { deskId: ids.it, kind: 'normal', appId: ids.tally, from: at(sat, '10:00'), to: at(sat, '12:00'), backout: 'Restore last night’s backup (30 minutes).' };
    await api('divya', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally', answers: LOW }).expect(403);
    await api('deskAdmin', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally', answers: LOW }).expect(403);
    await api('adminB', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally', answers: LOW }).expect(403);
    expect((await api('agent', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally', answers: { people: '0' } }).expect(400)).body.message).toMatch(/every risk question/);

    // Low: any IT lead.
    const low = (await api('agent', 'post', '/desk/changes').send({ ...base, title: 'Patch the Tally server', answers: LOW }).expect(201)).body;
    expect(low.stage).toBe('approval');
    expect(await taskFor('board1', low.number)).toBeUndefined();
    expect(await taskFor('owner', low.number)).toBeUndefined();
    expect(await taskFor('lead2', low.number)).toBeTruthy();
    await decide('lead', (await taskFor('lead', low.number))!.taskId, 'approve').expect(200);
    const lowRow = await change(low.id);
    expect([lowRow.stage, lowRow.risk, Boolean(lowRow.bannerId)]).toEqual(['scheduled', 'low', true]);
    const banner = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdBanner.findFirstOrThrow({ where: { id: lowRow.bannerId! } }));
    expect(banner.text).toMatch(/Planned IT change: Patch the Tally server/);
    expect(banner.startsAt.getTime()).toBe(lowRow.windowFrom.getTime() - 24 * 3_600_000);
    // Answer 1937: the service owner hears of it (sent once the decision is saved).
    const owned = () => tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.owner, type: 'helpdesk.change.scheduled' } }));
    for (let i = 0; i < 50 && !(await owned()); i++) await new Promise((r) => setTimeout(r, 100));
    expect(await owned()).toBe(1);

    // Medium: the IT lead, then the service owner; an application is needed.
    expect((await api('agent', 'post', '/desk/changes').send({ ...base, appId: undefined, service: 'Tally', title: 'Move Tally to a new disk', answers: MEDIUM }).expect(400)).body.message).toMatch(/owner approves/);
    const med = (await api('agent', 'post', '/desk/changes').send({ ...base, title: 'Move Tally to a new disk', answers: MEDIUM }).expect(201)).body;
    expect(await taskFor('owner', med.number)).toBeUndefined();
    await decide('lead2', (await taskFor('lead2', med.number))!.taskId, 'approve').expect(200);
    expect((await change(med.id)).stage).toBe('approval');
    await decide('owner', (await taskFor('owner', med.number))!.taskId, 'approve').expect(200);
    expect((await change(med.id)).stage).toBe('scheduled');

    // High: the change board, by majority (2 of 3); a lower risk than the answers needs a reason.
    expect((await api('agent', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally to version 6', answers: HIGH, risk: 'low' }).expect(400)).body.message).toMatch(/Say why it is lower/);
    const lowered = (await api('agent', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally to version 6 (tested)', answers: HIGH, risk: 'medium', riskReason: 'Tested end to end in the copy last week.' }).expect(201)).body;
    const lw = await change(lowered.id);
    expect([lw.risk, lw.riskFromAnswers]).toEqual(['medium', 'high']);
    const high = (await api('agent', 'post', '/desk/changes').send({ ...base, title: 'Upgrade Tally to version 6', answers: HIGH }).expect(201)).body;
    expect(await taskFor('lead2', high.number)).toBeUndefined();
    await decide('board1', (await taskFor('board1', high.number))!.taskId, 'approve').expect(200);
    expect((await change(high.id)).stage).toBe('approval');
    await decide('board2', (await taskFor('board2', high.number))!.taskId, 'approve').expect(200);
    expect((await change(high.id)).stage).toBe('scheduled');

    // Nobody approves their own change: the lead raising one is never asked (the other lead and the rest of the board are).
    const own = (await api('lead', 'post', '/desk/changes').send({ ...base, title: 'Rotate the Tally certificate', answers: LOW }).expect(201)).body;
    expect(await taskFor('lead', own.number)).toBeUndefined();
    expect(await taskFor('lead2', own.number)).toBeTruthy();
    const ownHigh = (await api('lead', 'post', '/desk/changes').send({ ...base, title: 'Replace the Tally server', answers: HIGH }).expect(201)).body;
    expect(await taskFor('lead', ownHigh.number)).toBeUndefined();
    expect(await taskFor('board1', ownHigh.number)).toBeTruthy();
    // A rejection ends it.
    await decide('lead2', (await taskFor('lead2', own.number))!.taskId, 'reject', 'Not this week, month-end close.').expect(200);
    expect((await change(own.id)).stage).toBe('rejected');
  });

  it('a freeze blocks scheduling unless an emergency says why; outside the window is refused; standard changes skip approval and lose it when they fail', async () => {
    const frozenDay = nextDay((p) => frozen(p));
    const weekday = nextDay((p) => p.dow >= 1 && p.dow <= 5 && !frozen(p));
    const base = { deskId: ids.it, appId: ids.tally, backout: 'Switch back to the old route.', answers: LOW };
    const inFreeze = await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'normal', title: 'Firewall rule change', from: at(frozenDay, '22:00'), to: at(frozenDay, '23:00') }).expect(400);
    expect(inFreeze.body.message).toMatch(/falls in a freeze/);
    expect((await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'emergency', title: 'Firewall rule change', from: at(frozenDay, '22:00'), to: at(frozenDay, '23:00') }).expect(400)).body.message).toMatch(/cannot wait/);
    const em = (await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'emergency', title: 'Block the attacker address range', from: at(frozenDay, '22:00'), to: at(frozenDay, '23:00'), freezeReason: 'Active attack on the VPN; cannot wait for the freeze to end.' }).expect(201)).body;
    expect((await change(em.id)).freezeReason).toMatch(/Active attack/);
    expect(await taskFor('board1', em.number)).toBeUndefined();
    expect(await taskFor('lead', em.number)).toBeTruthy();
    expect((await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'normal', title: 'Daytime switch swap', from: at(weekday, '14:00'), to: at(weekday, '15:00') }).expect(400)).body.message).toMatch(/outside the change window/);
    await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'emergency', title: 'Daytime switch swap', from: at(weekday, '14:00'), to: at(weekday, '15:00') }).expect(201);

    // Answer 1935: a pre-approved template (a change type only); a standard change from it is scheduled at once.
    await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'standard', title: 'Monthly laptop patching', from: at(weekday, '22:00'), to: at(weekday, '23:00') }).expect(400);
    const incidentType = (await typeOf(ids.it, 'incident'))!;
    await api('deskAdmin', 'post', `/desk/desks/${ids.it}/templates`).send({ name: 'Not a change', ticketTypeId: incidentType, defaults: {}, checklist: [], preApproved: true }).expect(400);
    ids.tpl = (await api('deskAdmin', 'post', `/desk/desks/${ids.it}/templates`).send({ name: 'Monthly laptop patching', ticketTypeId: ids.changeType, defaults: {}, checklist: ['Save the images', 'Patch', 'Check a sign-in'], preApproved: true }).expect(201)).body.id;
    const std = (await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'standard', templateId: ids.tpl, title: 'Monthly laptop patching', from: at(weekday, '22:00'), to: at(weekday, '23:00') }).expect(201)).body;
    expect(std.stage).toBe('scheduled');
    let d = (await api('agent', 'get', `/desk/changes/${std.id}`).expect(200)).body;
    expect([d.tasks.length, d.approval, d.can.start]).toEqual([3, null, true]);
    // Not before the window (half an hour's grace).
    expect((await api('agent', 'post', `/desk/changes/${std.id}/start`).send({ version: d.version }).expect(400)).body.message).toMatch(/Start then/);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.sdChange.update({ where: { id: std.id }, data: { windowFrom: new Date(Date.now() - 60_000) } }));
    await api('divya', 'post', `/desk/changes/${std.id}/start`).send({ version: d.version }).expect(403);
    await api('agent', 'post', `/desk/changes/${std.id}/start`).send({ version: d.version }).expect(200);
    d = (await api('agent', 'get', `/desk/changes/${std.id}`).expect(200)).body;
    await api('agent', 'patch', `/desk/changes/${std.id}/tasks`).send({ version: d.version, done: [true, false] }).expect(400);
    const tk = (await api('agent', 'patch', `/desk/changes/${std.id}/tasks`).send({ version: d.version, done: [true, true, false] }).expect(200)).body;
    await api('agent', 'post', `/desk/changes/${std.id}/outcome`).send({ version: tk.version, outcome: 'backed_out' }).expect(400);
    const out = (await api('agent', 'post', `/desk/changes/${std.id}/outcome`).send({ version: tk.version, outcome: 'backed_out', note: 'Two laptops failed to start after the patch.' }).expect(200)).body;
    expect(out.stage).toBe('review');
    expect(out.reviewDue).toBeTruthy();
    const tpl = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTemplate.findFirstOrThrow({ where: { id: ids.tpl } }));
    expect(tpl.preApproved).toBe(false);
    await api('agent', 'post', '/desk/changes').send({ ...base, kind: 'standard', templateId: ids.tpl, title: 'Monthly laptop patching again', from: at(weekday, '22:00'), to: at(weekday, '23:00') }).expect(400);
    // Answer 1938: someone other than the one who raised it reviews (an IT lead here).
    await api('agent', 'post', `/desk/changes/${std.id}/review`).send({ version: out.version, review: 'The driver for two old models was missing.' }).expect(403);
    const rv = (await api('lead', 'post', `/desk/changes/${std.id}/review`).send({ version: out.version, review: 'The driver for two old models was missing.' }).expect(200)).body;
    expect(rv.stage).toBe('backed_out');
    const row = await change(std.id);
    const t = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: row.ticketId } }));
    expect(t.systemState).toBe('solved');
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdBanner.findFirstOrThrow({ where: { id: row.bannerId! } }))).endedAt).toBeTruthy();
  });

  it('requesters and other companies never see changes; the change audit export lists the approvals', async () => {
    const list = (await api('agent', 'get', `/desk/changes?deskId=${ids.it}`).expect(200)).body;
    expect(list.rows.length).toBeGreaterThanOrEqual(8);
    expect([list.canRaise, list.questions.length]).toEqual([true, 5]);
    const one = list.rows.find((r: { title: string }) => r.title === 'Patch the Tally server');
    // Answer 1953: the list has no key of its own; a requester who is asked about nothing gets no access.
    expect((await api('divya', 'get', '/desk/changes').expect(200)).body.access).toBe(false);
    await api('divya', 'get', `/desk/changes/${one.id}`).expect(404);
    expect(((await api('divya', 'get', '/desk/my/tickets').expect(200)).body as { number: string }[]).map((x) => x.number)).not.toContain(one.number);
    // Company B's IT agent sees only company B's changes.
    await api('agentB', 'get', `/desk/changes/${one.id}`).expect(404);
    await api('agentB', 'get', `/desk/changes?deskId=${ids.it}`).expect(404);
    const bList = (await api('agentB', 'get', '/desk/changes').expect(200)).body;
    expect([bList.desk.id, bList.rows.length]).toEqual([ids.itB, 0]);
    // The service owner opens a change to their application; they cannot act on it.
    expect((await api('owner', 'get', `/desk/changes/${one.id}`).expect(200)).body.can).toEqual({ start: false, work: false, review: false, cancel: false, export: false });
    const csv = await api('agent', 'get', `/desk/changes/export?deskId=${ids.it}&from=2026-01-01&to=2026-12-31&format=csv`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/^Change,What changes,Kind,Risk/);
    expect(csv.text).toContain(one.number);
    expect(csv.text).toMatch(/approved by lead/);
    expect(csv.text).toMatch(/pre-approved template/);
    const pdf = await api('agent', 'get', `/desk/changes/export?deskId=${ids.it}&from=2026-01-01&to=2026-12-31&format=pdf`)
      .buffer(true)
      .parse((res, cb) => {
        const b: Buffer[] = [];
        res.on('data', (c: Buffer) => b.push(c));
        res.on('end', () => cb(null, Buffer.concat(b)));
      })
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await api('divya', 'get', `/desk/changes/export?deskId=${ids.it}&from=2026-01-01&to=2026-12-31&format=csv`).expect(403);
    await api('agentB', 'get', `/desk/changes/export?deskId=${ids.it}&from=2026-01-01&to=2026-12-31&format=csv`).expect(404);
    await api('agent', 'get', `/desk/changes/export?deskId=${ids.it}&from=2026-12-31&to=2026-01-01&format=csv`).expect(400);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.change.exported' } }))).toBe(2);
  });

  // The founder's coordinator, 13 Nov 2026: an email about a decision leaves only once the decision is saved.
  it('work after a decision (the owner email) runs only after the decision commits; a failed save sends nothing', async () => {
    const ran: string[] = [];
    let fail = true;
    engine.register({
      key: 'test.after_commit',
      label: 'After-commit test',
      risk: 'high',
      autoActions: false,
      onDecided: async (_tx, req, _outcome, afterCommit) => {
        afterCommit?.(async () => void ran.push(req.id));
        if (fail) throw new Error('the save failed');
      },
      requesterLink: () => '/yx/approvals',
    });
    const ask = () =>
      tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, (tx) =>
        engine.submit(tx, { organizationId: org.A.id, isSuperAdmin: false }, { type: 'test.after_commit', subjectType: 'test', subjectId: randomUUID(), title: `After commit ${randomUUID().slice(0, 6)}`, summary: [], subjectPersonId: null, requesterUserId: users.agent, raisedByUserId: null, steps: [{ name: 'Lead', approvers: [{ kind: 'users', userIds: [users.lead2] }], mode: 'any' }], payload: {}, payloadFields: [], fallbackUserIds: [] }),
      );
    const first = await ask();
    const task1 = (await inbox('lead2')).find((x) => x.requestId === first.id)!;
    expect((await decide('lead2', task1.taskId, 'approve')).status).toBeGreaterThanOrEqual(500);
    expect(ran).toEqual([]);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: first.id } }))).status).toBe('pending');
    fail = false;
    await decide('lead2', task1.taskId, 'approve').expect(200);
    expect(ran).toEqual([first.id]);
  });

  // ------------------------------------------------------------------------------------------------ ITSM-3 and ITSM-4

  const raiseIncident = async (subject: string, categoryId: string) => (await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, categoryId, subject, description: 'It keeps happening.' }).expect(201)).body as { id: string; number: string };
  const sat = () => nextDay((p) => p.dow === 6 && !frozen(p));
  /** A low-risk change the other lead approves, scheduled. */
  const scheduledChange = async (title: string, who: Who = 'agent') => {
    const day = sat();
    const c = (await api(who, 'post', '/desk/changes').send({ deskId: ids.it, kind: 'normal', appId: ids.tally, title, answers: LOW, from: at(day, '10:00'), to: at(day, '12:00'), backout: 'Restore the backup.' }).expect(201)).body;
    await decide('lead2', (await taskFor('lead2', c.number))!.taskId, 'approve').expect(200);
    return c as { id: string; number: string };
  };
  const startNow = async (id: string, who: Who = 'agent') => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.sdChange.update({ where: { id }, data: { windowFrom: new Date(Date.now() - 60_000) } }));
    const v = (await api(who, 'get', `/desk/changes/${id}`).expect(200)).body.version;
    return (await api(who, 'post', `/desk/changes/${id}/start`).send({ version: v }).expect(200)).body.version as number;
  };

  it('problems: raised by IT agents (by hand or from a repeat the lead is shown), incidents linked in bulk, a known error drafts an article for agents', async () => {
    const cats = (await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body.categories as { id: string; name: string }[];
    ids.wifi = cats[0]!.id;
    const inc = [await raiseIncident('Wi-Fi drops on floor 2', ids.wifi), await raiseIncident('No Wi-Fi in the meeting room', ids.wifi), await raiseIncident('Wi-Fi slow again', ids.wifi)];
    ids.inc0 = inc[0]!.id;
    // Answer 1939: the lead sees the suggestion; an agent does not; it is never raised by itself.
    const leadList = (await api('lead', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body;
    expect(leadList.suggestions.find((x: { categoryId: string }) => x.categoryId === ids.wifi)).toMatchObject({ count: 3, days: 7 });
    expect((await api('agent', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body.suggestions).toEqual([]);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdProblem.count({ where: { organizationId: org.A.id } }))).toBe(0);
    await api('divya', 'post', '/desk/problems').send({ deskId: ids.it, title: 'Wi-Fi drops' }).expect(403);
    await api('deskAdmin', 'post', '/desk/problems').send({ deskId: ids.it, title: 'Wi-Fi drops' }).expect(403);
    const p = (await api('agent', 'post', '/desk/problems').send({ deskId: ids.it, title: 'Wi-Fi drops on floor 2', categoryId: ids.wifi, incidentIds: inc.slice(0, 2).map((i) => i.id) }).expect(201)).body;
    ids.problem = p.id;
    expect(p.linked).toBe(2);
    expect((await api('lead', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body.suggestions.find((x: { categoryId: string }) => x.categoryId === ids.wifi)).toBeUndefined();
    // Bulk link by number: unknown and non-incident numbers are refused; the same incident links once.
    expect((await api('agent', 'post', `/desk/problems/${p.id}/incidents`).send({ numbers: ['IT-99999'] }).expect(400)).body.message).toMatch(/Not found/);
    const aChange = (await api('agent', 'get', `/desk/changes?deskId=${ids.it}`).expect(200)).body.rows[0];
    expect((await api('agent', 'post', `/desk/problems/${p.id}/incidents`).send({ numbers: [aChange.number] }).expect(400)).body.message).toMatch(/not an incident/);
    expect((await api('agent', 'post', `/desk/problems/${p.id}/incidents`).send({ numbers: [inc[2]!.number, inc[0]!.number] }).expect(200)).body.linked).toBe(1);
    // Never seen by requesters or other companies.
    await api('divya', 'get', `/desk/problems/${p.id}`).expect(403);
    await api('agentB', 'get', `/desk/problems/${p.id}`).expect(404);
    await api('agentB', 'post', `/desk/problems/${p.id}/incidents`).send({ numbers: [inc[0]!.number] }).expect(404);
    expect(((await api('divya', 'get', '/desk/my/tickets').expect(200)).body as { number: string }[]).map((x) => x.number)).not.toContain(p.number);

    // Answer 1940: the workaround drafts an article in the agents' space; only a lead may choose a space employees read.
    let d = (await api('agent', 'get', `/desk/problems/${p.id}`).expect(200)).body;
    expect(d.incidents).toHaveLength(3);
    expect((await api('agent', 'post', `/desk/problems/${p.id}/known-error`).send({ version: d.version, workaround: 'Use the wired port at each desk until the fix.', article: true }).expect(400)).body.message).toMatch(/no space for agents/);
    await api('adminA', 'post', '/desk/kb/spaces').send({ name: 'IT agents', slug: `it-agents-${run}`, audience: 'agents', deskId: ids.it }).expect(201);
    const help = (await api('adminA', 'post', '/desk/kb/spaces').send({ name: 'IT help', slug: `it-help-${run}`, audience: 'requesters', deskId: ids.it }).expect(201)).body.id;
    await api('agent', 'post', `/desk/problems/${p.id}/known-error`).send({ version: d.version, workaround: 'Use the wired port at each desk until the fix.', article: true, spaceId: help }).expect(403);
    const ke = (await api('agent', 'post', `/desk/problems/${p.id}/known-error`).send({ version: d.version, workaround: 'Use the wired port at each desk until the fix.', article: true, banner: true }).expect(200)).body;
    expect(ke.state).toBe('known_error');
    const article = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdKbArticle.findFirstOrThrow({ where: { id: ke.articleId } }));
    expect([article.audience, article.state]).toEqual(['agents', 'draft']);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdBanner.findFirstOrThrow({ where: { id: ke.bannerId } }))).ticketId).toBe((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdProblem.findFirstOrThrow({ where: { id: p.id } }))).ticketId); // answer 2051: Me too raises a linked incident
    await api('agent', 'post', `/desk/problems/${p.id}/known-error`).send({ version: d.version, workaround: 'Old version of the page.' }).expect(409);
    d = (await api('agent', 'get', `/desk/problems/${p.id}`).expect(200)).body;
    await api('agent', 'patch', `/desk/problems/${p.id}`).send({ version: d.version, rootCause: 'The access point firmware drops clients after 6 hours.', closingReply: 'Fixed: the access point firmware was updated. Reply if Wi-Fi still drops.' }).expect(200);
  });

  it('a problem closes through its fixing change and every open incident gets the reply and is solved; a lead may close one without a change', async () => {
    const c = await scheduledChange('Update the floor 2 access points');
    await api('agent', 'post', `/desk/problems/${ids.problem}/fix`).send({ changeId: c.id }).expect(200);
    await api('agent', 'post', `/desk/problems/${ids.problem}/fix`).send({ changeId: c.id }).expect(409);
    const v = await startNow(c.id);
    expect((await api('agent', 'post', `/desk/changes/${c.id}/outcome`).send({ version: v, outcome: 'done' }).expect(200)).body.stage).toBe('closed');
    const p = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdProblem.findFirstOrThrow({ where: { id: ids.problem } }));
    expect(p.state).toBe('closed');
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdBanner.findFirstOrThrow({ where: { id: p.bannerId! } }))).endedAt).toBeTruthy();
    const incident = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: ids.inc0 } }));
    expect(incident.systemState).toBe('solved');
    const last = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicketMessage.findFirstOrThrow({ where: { ticketId: ids.inc0, kind: 'reply', side: 'agent' }, orderBy: { createdAt: 'desc' } }));
    expect(last.bodyText).toMatch(/access point firmware was updated/);
    // By hand: only a lead.
    const other = (await api('agent', 'post', '/desk/problems').send({ deskId: ids.it, title: 'Printer queue stuck on Mondays' }).expect(201)).body;
    const od = (await api('agent', 'get', `/desk/problems/${other.id}`).expect(200)).body;
    expect(od.can.close).toBe(false);
    await api('agent', 'post', `/desk/problems/${other.id}/close`).send({ version: od.version }).expect(403);
    expect((await api('lead', 'post', `/desk/problems/${other.id}/close`).send({ version: od.version, reply: 'It was a duplicate.' }).expect(200)).body.state).toBe('closed');
  });

  it('a change is cancelled before it starts by the raiser or a lead, with a reason; never once it started (answer 1951)', async () => {
    const c = await scheduledChange('Move the print server');
    let d = (await api('agent', 'get', `/desk/changes/${c.id}`).expect(200)).body;
    expect(d.can.cancel).toBe(true);
    await api('agent', 'post', `/desk/changes/${c.id}/cancel`).send({ version: d.version, reason: 'short' }).expect(400);
    await api('owner', 'post', `/desk/changes/${c.id}/cancel`).send({ version: d.version, reason: 'Not needed any more, the server stays.' }).expect(403);
    const res = (await api('agent', 'post', `/desk/changes/${c.id}/cancel`).send({ version: d.version, reason: 'Not needed any more, the server stays.' }).expect(200)).body;
    expect(res.stage).toBe('cancelled');
    const row = await change(c.id);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdBanner.findFirstOrThrow({ where: { id: row.bannerId! } }))).endedAt).toBeTruthy();
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: row.ticketId } }))).systemState).toBe('closed');
    // Waiting for approval: a lead withdraws it, and the approver's task goes away.
    const day = sat();
    const waiting = (await api('agent', 'post', '/desk/changes').send({ deskId: ids.it, kind: 'normal', appId: ids.tally, title: 'Rename the file share', answers: LOW, from: at(day, '13:00'), to: at(day, '14:00'), backout: 'Rename it back.' }).expect(201)).body;
    expect(await taskFor('lead2', waiting.number)).toBeTruthy();
    d = (await api('lead', 'get', `/desk/changes/${waiting.id}`).expect(200)).body;
    await api('lead', 'post', `/desk/changes/${waiting.id}/cancel`).send({ version: d.version, reason: 'Merged into the bigger file share change.' }).expect(200);
    expect(await taskFor('lead2', waiting.number)).toBeUndefined();
    // Once started it cannot be cancelled.
    const started = await scheduledChange('Swap the core switch fan');
    const v = await startNow(started.id);
    await api('agent', 'post', `/desk/changes/${started.id}/cancel`).send({ version: v, reason: 'Changed my mind about it.' }).expect(400);
    ids.started = started.id;
  });

  it('a lead is told once when a change runs past its window (answer 1955)', async () => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.sdChange.update({ where: { id: ids.started }, data: { windowTo: new Date(Date.now() - 60_000) } }));
    const changes = app.get(ChangesService);
    expect(await changes.overrunTick()).toBeGreaterThanOrEqual(1);
    const told = () => tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { organizationId: org.A.id, type: 'helpdesk.change.overrun' } }));
    expect(await told()).toBe(2); // both leads
    await changes.overrunTick();
    expect(await told()).toBe(2);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.agent, type: 'helpdesk.change.overrun' } }))).toBe(0);
  });

  it('the change board and application owners see only the changes they are asked about (answer 1953)', async () => {
    const mine = (await api('board1', 'get', '/desk/changes').expect(200)).body;
    expect(mine.asked).toBe(true);
    expect(mine.rows.length).toBeGreaterThan(0);
    const counts = (await api('board1', 'get', '/workspace/counts').expect(200)).body;
    expect(counts.changesAsked).toBeGreaterThanOrEqual(0);
    const owner = (await api('owner', 'get', '/desk/changes').expect(200)).body;
    expect(owner.rows.every((r: { service: string }) => r.service === 'Tally Prime')).toBe(true);
    expect((await api('divya', 'get', '/workspace/counts').expect(200)).body.changesAsked).toBeUndefined();
    expect((await api('agentB', 'get', '/desk/changes').expect(200)).body.rows).toEqual([]);
  });

  it('a pre-approved standard change repeats on one schedule and is raised on time; a window in a freeze is skipped (answer 1952)', async () => {
    const tpl = (await api('deskAdmin', 'post', `/desk/desks/${ids.it}/templates`).send({ name: 'Weekly backup check', ticketTypeId: ids.changeType, defaults: {}, checklist: ['Check the last backup', 'Restore one file'], preApproved: true }).expect(201)).body.id;
    const day = sat();
    const startsAt = at(day, '10:00');
    const body = { deskId: ids.it, name: 'Weekly backup check', rrule: 'FREQ=WEEKLY;BYDAY=SA', timeZone: 'Asia/Kolkata', startsAt, template: { subject: 'Weekly backup check', bodyHtml: '', standard: { templateId: tpl, startAfterHours: 0, minutes: 60 } } };
    await api('deskAdmin', 'post', '/desk/recurring').send({ ...body, template: { ...body.template, standard: { templateId: ids.tpl, startAfterHours: 0, minutes: 60 } } }).expect(400);
    const r = (await api('deskAdmin', 'post', '/desk/recurring').send(body).expect(201)).body;
    expect((await api('deskAdmin', 'post', '/desk/recurring').send({ ...body, name: 'Again' }).expect(409)).body.message).toMatch(/already repeats/);
    const recurring = app.get(RecurringService);
    expect(await recurring.tick(new Date(new Date(startsAt).getTime() + 60_000))).toBe(1);
    const run = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdRecurringRun.findFirstOrThrow({ where: { recurringId: r.id } }));
    const made = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdChange.findFirstOrThrow({ where: { ticketId: run.ticketId! } }));
    expect([made.changeKind, made.stage, made.windowFrom.toISOString(), (made.tasks as unknown[]).length]).toEqual(['standard', 'scheduled', new Date(startsAt).toISOString(), 2]);
    // A schedule whose window falls in a freeze makes nothing that day (and says why).
    await api('deskAdmin', 'patch', `/desk/recurring/${r.id}`).send({ version: r.version, state: 'paused' }).expect(200);
    const frozenDay = nextDay((p) => frozen(p) && p.dow === 6);
    const r2 = (await api('deskAdmin', 'post', '/desk/recurring').send({ ...body, name: 'Frozen check', startsAt: at(frozenDay, '10:00'), template: { ...body.template, standard: { templateId: (await api('deskAdmin', 'post', `/desk/desks/${ids.it}/templates`).send({ name: 'Monthly antivirus update', ticketTypeId: ids.changeType, defaults: {}, checklist: [], preApproved: true }).expect(201)).body.id, startAfterHours: 0, minutes: 60 } } }).expect(201)).body;
    expect(await recurring.tick(new Date(new Date(at(frozenDay, '10:00')).getTime() + 60_000))).toBe(0);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdRecurringRun.findFirstOrThrow({ where: { recurringId: r2.id } }))).ticketId).toBeNull();
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'desk.recurring.skipped', entityId: r2.id } }))).toBe(1);
  });

  it('the report counts changes by kind and outcome, the failed-change rate and problems; only the desk sees it', async () => {
    const rep = (await api('lead', 'get', `/desk/itsm/report?deskId=${ids.it}&from=2026-01-01&to=2027-12-31`).expect(200)).body;
    const standard = rep.changes.byKind.find((k: { kind: string }) => k.kind === 'standard');
    expect(standard.backed_out).toBeGreaterThanOrEqual(1);
    expect(rep.changes.failedRate).toBeGreaterThan(0);
    expect(rep.changes.byKind.find((k: { kind: string }) => k.kind === 'normal').cancelled).toBe(2);
    expect(rep.problems.top[0].incidents).toBe(3);
    await api('divya', 'get', `/desk/itsm/report?deskId=${ids.it}&from=2026-01-01&to=2027-12-31`).expect(403);
    await api('agentB', 'get', `/desk/itsm/report?deskId=${ids.it}&from=2026-01-01&to=2027-12-31`).expect(404);
  });

  // ------------------------------------------------------------------------------------------------ follow-ups 2051-2058

  it('an IT ticket names its application, and repeats on one application suggest a problem (answer 2057)', async () => {
    const hrCat = ((await api('adminA', 'get', `/desk/desks/${ids.hr}`).expect(200)).body.categories as { id: string }[])[0]!.id;
    expect((await api('divya', 'get', '/desk/my/desks').expect(200)).body.find((d: { id: string }) => d.id === ids.it).apps.map((x: { id: string }) => x.id)).toContain(ids.tally);
    await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.hr, categoryId: hrCat, appId: ids.tally, subject: 'Tally payslip', description: 'x' }).expect(400);
    const raised: { id: string; number: string }[] = [];
    for (const s of ['Tally will not open', 'Tally freezes on save', 'Tally login fails']) raised.push((await api('divya', 'post', '/desk/my/tickets').send({ deskId: ids.it, appId: ids.tally, subject: s, description: 'Since this morning.' }).expect(201)).body);
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: raised[0]!.id } }))).appId).toBe(ids.tally);
    const app = (s: { kind?: string; appId?: string | null }) => s.kind === 'application' && s.appId === ids.tally;
    expect((await api('lead', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body.suggestions.find(app)).toMatchObject({ count: 3, category: 'Tally Prime' });
    // The agent clears it on one ticket: below the count, no suggestion. Others may not.
    await api('divya', 'put', `/desk/tickets/${raised[2]!.id}/app`).send({ appId: null }).expect(403);
    await api('agentB', 'put', `/desk/tickets/${raised[2]!.id}/app`).send({ appId: null }).expect(404);
    await api('agent', 'put', `/desk/tickets/${raised[2]!.id}/app`).send({ appId: randomUUID() }).expect(400);
    await api('agent', 'put', `/desk/tickets/${raised[2]!.id}/app`).send({ appId: null }).expect(200);
    expect((await api('lead', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body.suggestions.find(app)).toBeUndefined();
    expect((await api('agent', 'put', `/desk/tickets/${raised[2]!.id}/app`).send({ appId: ids.tally }).expect(200)).body.app.name).toBe('Tally Prime');
    const s = (await api('lead', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body.suggestions.find(app);
    const p = (await api('lead', 'post', '/desk/problems').send({ deskId: ids.it, title: 'Tally keeps failing', appId: ids.tally, incidentIds: s.incidentIds }).expect(201)).body;
    ids.tallyProblem = p.id;
    expect(p.linked).toBe(3);
    expect((await api('lead', 'get', `/desk/problems?deskId=${ids.it}`).expect(200)).body.suggestions.find(app)).toBeUndefined();
  });

  it('"Me too" on a known problem raises the person\'s own incident, linked to the problem (answer 2051)', async () => {
    const d = (await api('agent', 'get', `/desk/problems/${ids.tallyProblem}`).expect(200)).body;
    const ke = (await api('agent', 'post', `/desk/problems/${ids.tallyProblem}/known-error`).send({ version: d.version, workaround: 'Open Tally from the second shortcut on the desktop.', banner: true }).expect(200)).body;
    const banners = (await api('divya', 'get', '/desk/my/banners').expect(200)).body as { id: string; canMeToo: boolean }[];
    const b = banners.find((x) => x.id === ke.bannerId)!;
    expect(b.canMeToo).toBe(true);
    const res = (await api('divya', 'post', `/desk/my/banners/${b.id}/me-too`).expect(200)).body;
    expect(res.ticket.number).toMatch(/^IT-/);
    const mine = await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicket.findFirstOrThrow({ where: { id: res.ticket.id } }));
    expect([mine.kind, mine.requesterPersonId]).toEqual(['incident', people.divya]);
    const problemTicket = (await tenantPrisma.forTenant(SUPER, (tx) => tx.sdProblem.findFirstOrThrow({ where: { id: ids.tallyProblem } }))).ticketId;
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.sdTicketLink.count({ where: { fromTicketId: mine.id, toTicketId: problemTicket, kind: 'tracked_by' } }))).toBe(1);
    expect((await api('divya', 'post', `/desk/my/banners/${b.id}/me-too`).expect(200)).body.already).toBe(true);
    // The employee follows their own ticket, never the problem.
    expect(((await api('divya', 'get', '/desk/my/tickets').expect(200)).body as { id: string }[]).map((x) => x.id)).toContain(mine.id);
    expect(((await api('divya', 'get', '/desk/my/tickets').expect(200)).body as { id: string }[]).map((x) => x.id)).not.toContain(problemTicket);
  });

  it('a change raised from a problem is linked to fix it (answer 2058)', async () => {
    const day = sat();
    const base = { deskId: ids.it, kind: 'normal', appId: ids.tally, title: 'Patch Tally to 6.1', answers: LOW, from: at(day, '10:00'), to: at(day, '11:00'), backout: 'Reinstall 6.0.' };
    await api('agent', 'post', '/desk/changes').send({ ...base, problemId: ids.problem }).expect(400); // that problem is closed
    await api('agent', 'post', '/desk/changes').send({ ...base, problemId: randomUUID() }).expect(400);
    const c = (await api('agent', 'post', '/desk/changes').send({ ...base, problemId: ids.tallyProblem }).expect(201)).body;
    const d = (await api('agent', 'get', `/desk/problems/${ids.tallyProblem}`).expect(200)).body;
    expect(d.fixes.map((f: { number: string }) => f.number)).toEqual([c.number]);
  });

  it('notices reach one location or the application\'s users when the desk says so (answer 2056)', async () => {
    let s = (await api('deskAdmin', 'get', `/desk/desks/${ids.it}/itsm-settings`).expect(200)).body;
    expect(s.noticeScope).toBe('all');
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: s.version, noticeScope: 'nowhere' }).expect(400);
    s = (await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: s.version, noticeScope: 'location' }).expect(200)).body;
    const day = sat();
    const base = { deskId: ids.it, kind: 'normal', appId: ids.tally, title: 'Move the Tally database', answers: LOW, from: at(day, '15:00'), to: at(day, '16:00'), backout: 'Move it back.' };
    expect((await api('agent', 'post', '/desk/changes').send(base).expect(400)).body.message).toMatch(/Choose the location/);
    await api('agent', 'post', '/desk/changes').send({ ...base, noticeLocationId: randomUUID() }).expect(400);
    await api('agent', 'post', '/desk/changes').send({ ...base, banner: false }).expect(201);
    s = (await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: s.version, noticeScope: 'application' }).expect(200)).body;
    expect((await api('agent', 'post', '/desk/changes').send({ ...base, appId: undefined, service: 'Tally' }).expect(400)).body.message).toMatch(/application's users/);
    // A known error limited to Tally's users: only people given access to Tally see it.
    const other = (await api('agent', 'post', '/desk/problems').send({ deskId: ids.it, title: 'Tally reports print blank', appId: ids.tally }).expect(201)).body;
    const od = (await api('agent', 'get', `/desk/problems/${other.id}`).expect(200)).body;
    const ke = (await api('agent', 'post', `/desk/problems/${other.id}/known-error`).send({ version: od.version, workaround: 'Export to PDF and print the PDF instead.', banner: true }).expect(200)).body;
    expect((await tenantPrisma.forTenant(SUPER, (tx) => tx.sdBanner.findFirstOrThrow({ where: { id: ke.bannerId } }))).appId).toBe(ids.tally);
    expect(((await api('divya', 'get', '/desk/my/banners').expect(200)).body as { id: string }[]).map((x) => x.id)).not.toContain(ke.bannerId);
    const form = { sections: [{ id: 's', columns: 1, fields: [{ key: 'app', type: 'app', label: 'Which application?', required: true }] }], rules: [] };
    const team = ((await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body.groups as { id: string }[])[0]!.id;
    const cat = ((await api('adminA', 'get', `/desk/desks/${ids.it}`).expect(200)).body.categories as { id: string }[])[0]!.id;
    const item = (await api('adminA', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: `Tally access ${run}`, categoryId: cat, draft: { form, approval: [], fulfilment: [{ title: 'Give access', groupId: team }] } }).expect(201)).body;
    await api('adminA', 'post', `/desk/catalog/admin/items/${item.id}/publish`).send({ version: item.version }).expect(200);
    await api('divya', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: item.id, quantity: 1, answers: { app: ids.tally } }] }).expect(201);
    await tenantPrisma.forTenant(SUPER, (tx) => tx.sdRequestItem.updateMany({ where: { organizationId: org.A.id, itemId: item.id }, data: { stage: 'delivered' } }));
    expect(((await api('divya', 'get', '/desk/my/banners').expect(200)).body as { id: string }[]).map((x) => x.id)).toContain(ke.bannerId);
    await api('deskAdmin', 'put', `/desk/desks/${ids.it}/itsm-settings`).send({ version: s.version, noticeScope: 'all' }).expect(200);
  });

  it('the IT leads are told when a scheduled standard change is skipped (answer 2054)', async () => {
    for (let i = 0; i < 30 && !(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.lead, type: 'helpdesk.recurring.skipped' } }))); i++) await new Promise((r) => setTimeout(r, 100));
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.lead, type: 'helpdesk.recurring.skipped' } }))).toBe(1);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.lead2, type: 'helpdesk.recurring.skipped' } }))).toBe(1);
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { recipientUserId: users.agent, type: 'helpdesk.recurring.skipped' } }))).toBe(0);
  });
});
