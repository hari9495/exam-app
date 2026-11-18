import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { createHash, randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { mondayOf } from '../src/time/time-rules';

// Projects P-2 end to end (PRJ-02, founder answers 1406 to 1408, 1442; parked item 914). With Projects on, each line of
// a week goes to its own approver: a PM never decides another project's lines; a reduction or rejection needs a reason
// the person sees; the week is decided when every line is. Bulk approval only within the allocation (1407). Under
// "allow with manager approval" (1442) hours outside an allocation wait for the PM, one by one. A client approves only
// its own project's lines in the portal (1408), and a placement's hours count only that client's project lines (914).

jest.setTimeout(300_000);

describe('Projects P-2 line approvals', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let notify: jest.SpyInstance;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' } };
  type Who = 'admin' | 'am' | 'pmA' | 'pmB' | 'mgr' | 'emp' | 'peer' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const portal = (method: 'get' | 'post', path: string, t: string) => request(server())[method](`/api/v1/public/client-portal/${org.A.slug}${path}`).set('X-Client-Portal', t);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const week = mondayOf(today);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const tokens: Record<string, string> = {};
  const lineOf = async (projectId: string, employee = 'empEmp') =>
    inA(async (tx) => {
      const s = await tx.timesheet.findFirstOrThrow({ where: { employeeId: ids[employee], weekStart: day(week) } });
      return tx.timesheetLine.findFirstOrThrow({ where: { timesheetId: s.id, projectId } });
    });
  const decide = (who: Who, decisions: unknown[]) => api(who, 'post', '/time/line-approvals/decide').send({ decisions });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    notify = jest.spyOn(moduleRef.get(NotificationsService), 'notifySystem');

    planId = (await prisma.plan.create({ data: { name: `prj2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'PRJ2 Org A', slug: `prj2-a-${run}`, planId } });
    org.A = { id: created.id, slug: created.slug };
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['am', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['pmA', 'panel', ['projects.view', 'projects.manage']],
      ['pmB', 'panel', ['projects.view']],
      ['mgr', 'panel', []],
      ['emp', 'panel', []],
      ['peer', 'panel', []],
    ];
    for (const [who, role, keys] of roster) {
      const o = org.A.id;
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@prj2-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@prj2-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.pmA}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Prj2 Tech', shortName: `PRJ2-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'CHN', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: 'mgr' | 'emp' | 'peer', manager: string | null) =>
      (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(week, -60), userId: users[who], workEmail: `${who}@prj2-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(want(201))
      ).body.id as string;
    ids.mgrEmp = await hire('mgr', null);
    ids.empEmp = await hire('emp', ids.mgrEmp);
    ids.peerEmp = await hire('peer', ids.mgrEmp);
    // The staffing desk's clients (Projects' clients, 1403), a rate line and emp's own placement at Nilgiri.
    await api('am', 'put', '/staffing/settings').send({ changes: [{ key: 'staffing.desk.enabled', value: 'on' }] }).expect(want(200));
    const client = (name: string, state: string) => ({ name: `${name} ${run}`, legalName: name, state, billingAddress: 'Somewhere', status: 'active', contractStart: '2026-04-01', contractEnd: '2027-03-31' });
    ids.tn = (await api('am', 'post', '/staffing/clients').send(client('Nilgiri Retail', 'IN-TN')).expect(want(201))).body.id;
    ids.ka = (await api('am', 'post', '/staffing/clients').send(client('Coromandel', 'IN-KA')).expect(want(201))).body.id;
    for (const [k, cl] of [['tnContact', 'tn'], ['kaContact', 'ka']] as const) ids[k] = (await api('am', 'post', `/staffing/clients/${ids[cl]}/contacts`).send({ name: `Contact ${k}`, role: 'HR head', email: `${k}-${run}@client.test` }).expect(want(201))).body.id;
    await api('am', 'post', `/staffing/clients/${ids.tn}/rates`).send({ role: 'Java Developer', skill: 'Java', location: 'Chennai', unit: 'hour', billRate: '1200', payRate: '800', validFrom: today }).expect(want(201));
    await inA(async (tx) => {
      const lineId = (await tx.staffingRate.findFirstOrThrow({ where: { clientId: ids.tn } })).lineId;
      ids.placement = (await tx.staffingPlacement.create({ data: { organizationId: org.A.id, clientId: ids.tn!, lineId, supply: 'own', employeeId: ids.empEmp!, workerName: 'emp', startOn: day(addDays(week, -30)), endOn: day(addDays(week, 200)) } })).id;
      // A signed-in portal session for each client's contact.
      for (const [k, cl] of [['tnContact', 'tn'], ['kaContact', 'ka']] as const) {
        await tx.staffingClientContact.update({ where: { id: ids[k] }, data: { portal: 'active' } });
        tokens[cl] = randomUUID();
        await tx.staffingPortalSession.create({ data: { organizationId: org.A.id, contactId: ids[k]!, clientId: ids[cl]!, tokenHash: createHash('sha256').update(tokens[cl]!).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
      }
    });
    // Projects on; three projects: NRP (Nilgiri, PM A, client approves hours), KAV (Coromandel, PM B, client approves
    // hours) and INT (internal, no manager: the person's manager approves).
    // The timesheet note (1731 to 1736) has its own suite (timesheet-note); these weeks go without notes.
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }, { key: 'timesheet.note.required', value: 'off' }] }).expect(want(200));
    const project = async (code: string, body: Record<string, unknown>) => {
      const id = (await api('pmA', 'post', '/projects').send({ code, name: `Project ${code}`, ...body }).expect(want(201))).body.id as string;
      await api('pmA', 'post', `/projects/${id}/status`).send({ status: 'active', version: 1 }).expect(want(200));
      return id;
    };
    ids.nrp = await project('NRP', { billingModel: 'time_material', clientId: ids.tn, managerUserId: users.pmA, clientApprovesHours: true });
    ids.kav = await project('KAV', { billingModel: 'time_material', clientId: ids.ka, managerUserId: users.pmB, clientApprovesHours: true });
    ids.int = await project('INT', { billingModel: 'non_billable' });
    for (const [pid, percent] of [['nrp', 50], ['kav', 50], ['int', 10]] as const) await api('pmA', 'post', `/projects/${ids[pid]}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent }).expect(want(201));
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: org.A.id } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a submitted week goes line by line to each line’s own approver (no whole-week approval)', async () => {
    const lines = [
      { projectId: ids.nrp, activity: null, billable: true, minutes: [480, 480, 0, 0, 0, 0, 0] },
      { projectId: ids.kav, activity: null, billable: true, minutes: [0, 0, 480, 0, 0, 0, 0] },
      { projectId: ids.int, activity: null, billable: false, minutes: [0, 0, 0, 300, 0, 0, 0] },
    ];
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines }).expect(want(200));
    notify.mockClear();
    await api('emp', 'post', '/time/me/timesheet/submit').send({ week }).expect(want(200));
    const sheet = await inA((tx) => tx.timesheet.findFirstOrThrow({ where: { employeeId: ids.empEmp, weekStart: day(week) } }));
    expect(sheet).toMatchObject({ status: 'pending', wfRequestId: null });
    expect((await lineOf(ids.nrp!)).approverUserIds).toEqual([users.pmA]);
    expect((await lineOf(ids.kav!)).approverUserIds).toEqual([users.pmB]);
    expect((await lineOf(ids.int!)).approverUserIds).toEqual([users.mgr]);
    expect(notify).toHaveBeenCalledWith(expect.anything(), expect.arrayContaining([users.pmA, users.pmB, users.mgr]), 'time.timesheet.lines', expect.objectContaining({ linkPath: '/yx/projects/approvals' }), expect.anything());
    // Each approver sees only their own lines.
    const a = (await api('pmA', 'get', '/time/line-approvals').expect(want(200))).body;
    expect(a.groups.map((g: { project: string }) => g.project)).toEqual(['NRP']);
    expect((await api('pmB', 'get', '/time/line-approvals').expect(200)).body.groups.map((g: { project: string }) => g.project)).toEqual(['KAV']);
    expect((await api('emp', 'get', '/time/line-approvals').expect(200)).body.groups).toEqual([]);
    expect((await api('pmB', 'get', '/projects/status').expect(200)).body.lineApprovals).toBe(1);
  });

  it('a PM never decides another project’s lines; the person never decides their own; acting for someone else never', async () => {
    const kav = await lineOf(ids.kav!);
    const nrp = await lineOf(ids.nrp!);
    await decide('pmA', [{ lineId: kav.id, status: 'approved', version: kav.version }]).expect(403);
    await decide('pmB', [{ lineId: nrp.id, status: 'approved', version: nrp.version }]).expect(403);
    await decide('emp', [{ lineId: nrp.id, status: 'approved', version: nrp.version }]).expect(403);
    await decide('acting', [{ lineId: nrp.id, status: 'approved', version: nrp.version }]).expect(403);
    await decide('pmA', [{ lineId: nrp.id, status: 'approved', version: nrp.version + 5 }]).expect(409);
    await decide('pmA', [{ lineId: randomUUID(), status: 'approved', version: 1 }]).expect(404);
    for (const bad of [{ status: 'maybe' }, { version: 0 }, { hours: -1 }, { extra: 1 }]) await decide('pmA', [{ lineId: nrp.id, status: 'approved', version: nrp.version, ...bad }]).expect(400);
  });

  it('a reduction needs fewer hours and a reason, which the person sees (and is told); the week waits for every line', async () => {
    const nrp = await lineOf(ids.nrp!);
    await decide('pmA', [{ lineId: nrp.id, status: 'reduced', hours: 12, version: nrp.version }]).expect(400);
    await decide('pmA', [{ lineId: nrp.id, status: 'reduced', hours: 16, reason: 'Offsite on Tuesday', version: nrp.version }]).expect(400);
    await decide('pmA', [{ lineId: nrp.id, status: 'rejected', reason: ' ', version: nrp.version }]).expect(400);
    notify.mockClear();
    await decide('pmA', [{ lineId: nrp.id, status: 'reduced', hours: 12, reason: 'Offsite on Tuesday', version: nrp.version }]).expect(want(200));
    expect(notify).toHaveBeenCalledWith(expect.anything(), [users.emp], 'time.timesheet.line', expect.objectContaining({ contextText: expect.stringMatching(/NRP: reduced from 16 h to 12 h\. Reason: Offsite on Tuesday/) }), expect.anything());
    const mine = (await api('emp', 'get', `/time/me/timesheet?week=${week}`).expect(want(200))).body;
    expect(mine.sheet.status).toBe('pending');
    expect(mine.lines.find((l: { projectId: string }) => l.projectId === ids.nrp)).toMatchObject({ decision: 'reduced', reason: 'Offsite on Tuesday', approvedMinutes: [360, 360, 0, 0, 0, 0, 0] });
    // Once a line is decided the week can no longer be withdrawn.
    await api('emp', 'post', `/time/me/timesheet/${mine.sheet.id}/withdraw`).expect(409);
    await decide('pmA', [{ lineId: nrp.id, status: 'approved', version: nrp.version + 1 }]).expect(409); // already decided
  });

  it('bulk approves only within the allocation (1407); over it, the line is decided on its own', async () => {
    const int = await lineOf(ids.int!); // 5 h booked, 10% = 4 h allocated
    const list = (await api('mgr', 'get', '/time/line-approvals').expect(want(200))).body;
    expect(list.groups[0].items[0]).toMatchObject({ bulk: false, allocationPercent: 10 });
    expect((await api('mgr', 'post', '/time/line-approvals/bulk').send({ items: [{ lineId: int.id, version: int.version }] }).expect(400)).body.message).toMatch(/above the allocation/);
    const kav = await lineOf(ids.kav!); // 8 h of 20 h
    await api('pmB', 'post', '/time/line-approvals/bulk').send({ items: [{ lineId: kav.id, version: kav.version }] }).expect(want(200));
    await decide('mgr', [{ lineId: int.id, status: 'rejected', reason: 'Not booked on this project', version: int.version }]).expect(want(200));
  });

  it('914: the placement counts only its client’s project lines, as approved; the week is approved', async () => {
    const sheet = await inA((tx) => tx.timesheet.findFirstOrThrow({ where: { employeeId: ids.empEmp, weekStart: day(week) } }));
    expect(sheet.status).toBe('approved');
    const hours = await inA((tx) => tx.staffingHours.findFirstOrThrow({ where: { placementId: ids.placement, weekStart: day(week) } }));
    expect(hours).toMatchObject({ hoursCenti: 1200, source: 'time', timesheetId: sheet.id, clientId: ids.tn }); // NRP 12 h only, not KAV or INT
    // The day engine follows the approved minutes (reduced, rejected) too.
    expect((await lineOf(ids.int!)).status).toBe('rejected');
  });

  it('1408: a client sees and approves only its own project lines in the portal; never another client’s', async () => {
    const tnMe = (await portal('get', '/me', tokens.tn!).expect(want(200))).body;
    // NRP's lines went into the placement's hours (the client approves those as the week); no project line twice.
    expect(tnMe.projectHours).toEqual([]);
    expect(tnMe.timesheets.map((t: { hours: string }) => t.hours)).toEqual(['12']);
    const kaMe = (await portal('get', '/me', tokens.ka!).expect(want(200))).body;
    expect(kaMe.projectHours).toEqual([expect.objectContaining({ project: expect.stringMatching(/^KAV/), hours: '8', status: 'Waiting for you' })]);
    const kav = await lineOf(ids.kav!);
    await portal('post', `/project-hours/${kav.id}/approve`, tokens.tn!).expect(403);
    await portal('post', `/project-hours/${kav.id}/send-back`, tokens.ka!).send({}).expect(400);
    await portal('post', `/project-hours/${kav.id}/approve`, tokens.ka!).expect(want(200));
    await portal('post', `/project-hours/${kav.id}/approve`, tokens.ka!).expect(409);
    expect((await lineOf(ids.kav!)).clientStatus).toBe('approved');
    // The INT line (internal, rejected) and the NRP line never reach Coromandel.
    expect((await portal('get', '/me', tokens.ka!).expect(200)).body.projectHours).toHaveLength(1);
    await portal('post', `/project-hours/${(await lineOf(ids.nrp!)).id}/approve`, tokens.ka!).expect(403);
  });

  it('1442: under "allow with manager approval" hours outside an allocation are saved, flagged and never bulk-approved', async () => {
    const line = { projectId: ids.nrp, activity: null, billable: true, minutes: [120, 0, 0, 0, 0, 0, 0] };
    expect((await api('peer', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(400)).body.message).toMatch(/not allocated/);
    await api('pmA', 'put', '/projects/settings').send({ changes: [{ key: 'projects.booking.allocated_only', value: 'approval' }] }).expect(403);
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.booking.allocated_only', value: 'approval' }] }).expect(want(200));
    await api('peer', 'put', '/time/me/timesheet').send({ week, lines: [line] }).expect(want(200));
    await api('peer', 'post', '/time/me/timesheet/submit').send({ week }).expect(want(200));
    const l = await lineOf(ids.nrp!, 'peerEmp');
    expect(l).toMatchObject({ status: 'pending', unallocated: true, approverUserIds: [users.pmA] });
    const item = (await api('pmA', 'get', '/time/line-approvals').expect(200)).body.groups[0].items.find((i: { unallocated: boolean }) => i.unallocated);
    expect(item).toMatchObject({ bulk: false, allocationPercent: null });
    expect((await api('pmA', 'post', '/time/line-approvals/bulk').send({ items: [{ lineId: l.id, version: l.version }] }).expect(400)).body.message).toMatch(/outside an allocation/);
    await decide('pmA', [{ lineId: l.id, status: 'approved', version: l.version }]).expect(want(200));
    expect((await inA((tx) => tx.timesheet.findFirstOrThrow({ where: { employeeId: ids.peerEmp, weekStart: day(week) } }))).status).toBe('approved');
    // Every decision is audited.
    expect(await inA((tx) => tx.auditLog.count({ where: { action: { startsWith: 'time.timesheet_line.' } } }))).toBe(4); // reduced, bulk-approved, rejected, approved
  });
  it('batch D A5 / 2535: my weeks not sent, the project manager’s Not sent list and a once-a-day reminder; refusals', async () => {
    // peer worked on NRP for the four weeks before this one (the allocation ends last Sunday).
    await api('pmA', 'post', `/projects/${ids.nrp}/allocations`).send({ employeeId: ids.peerEmp, fromOn: addDays(week, -28), toOn: addDays(week, -1), percent: 50 }).expect(want(201));
    // A draft of two weeks ago; nothing at all for the others.
    await api('peer', 'put', '/time/me/timesheet').send({ week: addDays(week, -14), lines: [{ projectId: ids.nrp, activity: null, billable: true, minutes: [240, 0, 0, 0, 0, 0, 0] }] }).expect(want(200));
    const mine = (await api('peer', 'get', '/time/me/timesheet/not-sent').expect(200)).body.weeks as { week: string; status: string; totalMinutes: number }[];
    expect(mine.map((w) => w.week).every((w) => w >= addDays(week, -28) && w <= addDays(week, -7))).toBe(true);
    expect(mine.find((w) => w.week === addDays(week, -14))).toMatchObject({ status: 'draft', totalMinutes: 240 });
    expect(mine.some((w) => w.status === 'not_started')).toBe(true);
    // This week is not due yet; emp (allocated only from this week, not on a timesheet attendance mode) has none.
    expect(mine.some((w) => w.week === week)).toBe(false);
    expect((await api('emp', 'get', '/time/me/timesheet/not-sent').expect(200)).body.weeks).toEqual([]);
    await api('peer', 'get', '/time/me/timesheet/not-sent?weeks=99').expect(400);
    // The project manager of NRP sees peer with NRP; pmB (KAV) sees nobody.
    const list = (await api('pmA', 'get', '/time/line-approvals/not-sent').expect(200)).body.people as { employeeId: string; projects: string[]; weeks: unknown[]; canRemind: boolean }[];
    expect(list).toEqual([expect.objectContaining({ employeeId: ids.peerEmp, projects: ['NRP'], canRemind: true })]);
    expect(list[0]!.weeks).toHaveLength(mine.length);
    expect((await api('pmB', 'get', '/time/line-approvals/not-sent').expect(200)).body.people).toEqual([]);
    // Remind: once a day per person; never someone outside my projects, never while acting for someone else.
    await api('pmB', 'post', `/time/line-approvals/not-sent/${ids.peerEmp}/remind`).expect(404);
    await api('acting', 'post', `/time/line-approvals/not-sent/${ids.peerEmp}/remind`).expect(403);
    notify.mockClear();
    expect((await api('pmA', 'post', `/time/line-approvals/not-sent/${ids.peerEmp}/remind`).expect(200)).body).toMatchObject({ reminded: true, weeks: mine.length });
    expect(notify.mock.calls.some((c) => (c[1] as string[]).includes(users.peer!) && c[2] === 'timesheet.not_sent')).toBe(true);
    expect((await api('pmA', 'post', `/time/line-approvals/not-sent/${ids.peerEmp}/remind`).expect(409)).body.message).toMatch(/reminded in the last day/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'timesheet.not_sent_reminded', entityId: ids.peerEmp } }))).toBe(1);
    expect((await api('pmA', 'get', '/time/line-approvals/not-sent').expect(200)).body.people[0].canRemind).toBe(false);
    // Once sent, the week leaves both lists.
    await api('peer', 'post', '/time/me/timesheet/submit').send({ week: addDays(week, -14) }).expect(want(200));
    expect(((await api('peer', 'get', '/time/me/timesheet/not-sent').expect(200)).body.weeks as { week: string }[]).some((w) => w.week === addDays(week, -14))).toBe(false);

    // The person's own working days count, not Monday to Friday: three weeks ago Monday to Friday are all holidays.
    const w3 = addDays(week, -21);
    await inA(async (tx) => {
      const cal = await tx.holidayCalendar.create({ data: { organizationId: org.A.id, name: `Chennai ${run}`, locationId: ids.loc! } });
      for (let k = 0; k < 5; k++) await tx.holiday.create({ data: { organizationId: org.A.id, calendarId: cal.id, holidayOn: day(addDays(w3, k)), name: `Festival ${k + 1}` } });
    });
    const has = async () => ((await api('peer', 'get', '/time/me/timesheet/not-sent').expect(200)).body.weeks as { week: string }[]).some((w) => w.week === w3);
    // A six-day week (only Sunday off, the location's rule): Saturday is a working day, so the week is still owed.
    expect(await has()).toBe(true);
    // A five-day week (Saturday and Sunday off): nothing was due that week, so it is not listed.
    await inA((tx) => tx.locationAttendanceRule.create({ data: { organizationId: org.A.id, locationId: ids.loc!, validFrom: day(addDays(week, -90)), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [{ weekday: 6 }, { weekday: 7 }] } }));
    expect(await has()).toBe(false);
  });
});
