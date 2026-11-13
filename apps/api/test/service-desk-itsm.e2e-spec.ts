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

// Helpdesk ITSM (docs/yukthix/helpdesk-itsm-plan.md; answers 1931-1943). ITSM-1: change and problem are ticket kinds on
// IT desks only, never raised as tickets or by requesters; the desk's change settings and the company's change window,
// each with its default. Positive and negative; one company never sees another's.
describe('Helpdesk ITSM: changes and problems', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
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
    await api('divya', 'get', '/desk/changes').expect(403);
    await api('divya', 'get', `/desk/changes/${one.id}`).expect(404);
    expect(((await api('divya', 'get', '/desk/my/tickets').expect(200)).body as { number: string }[]).map((x) => x.number)).not.toContain(one.number);
    // Company B's IT agent sees only company B's changes.
    await api('agentB', 'get', `/desk/changes/${one.id}`).expect(404);
    await api('agentB', 'get', `/desk/changes?deskId=${ids.it}`).expect(404);
    const bList = (await api('agentB', 'get', '/desk/changes').expect(200)).body;
    expect([bList.desk.id, bList.rows.length]).toEqual([ids.itB, 0]);
    // The service owner opens a change to their application; they cannot act on it.
    expect((await api('owner', 'get', `/desk/changes/${one.id}`).expect(200)).body.can).toEqual({ start: false, work: false, review: false, export: false });
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
});
