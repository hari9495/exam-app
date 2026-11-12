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

// Founder request, answers 1731 to 1736: a required note on every timesheet row. Save draft never asks; Submit week is
// refused (by the API too) until every row with hours has at least N words (a company setting, default required and
// 200 words); the setting off allows an empty note; each row's approver reads the note of their own project's rows
// only; the client sees notes only when the project shows them (off by default); Projects finance reads them in the
// billing workbench.

jest.setTimeout(300_000);

describe('Timesheet note (1731 to 1736)', () => {
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
  type Who = 'admin' | 'am' | 'pmA' | 'pmB' | 'fin' | 'mgr' | 'emp' | 'peer' | 'acting';
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

    planId = (await prisma.plan.create({ data: { name: `tsn-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const created = await prisma.organization.create({ data: { name: 'TSN Org A', slug: `tsn-a-${run}`, planId } });
    org.A = { id: created.id, slug: created.slug };
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['am', 'panel', ['ats.staffing.manage', 'ats.staffing.view']],
      ['pmA', 'panel', ['projects.view', 'projects.manage']],
      ['pmB', 'panel', ['projects.view']],
      ['fin', 'panel', ['projects.view', 'projects.finance']],
      ['mgr', 'panel', []],
      ['emp', 'panel', []],
      ['peer', 'panel', []],
    ];
    for (const [who, role, keys] of roster) {
      const o = org.A.id;
      const permissionProfileId = keys ? (await inA((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inA((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@tsn-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `${who}@tsn-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.pmA}`).expect(200)).body.accessToken;
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Tsn Tech', shortName: `TSN-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'CHN', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Delivery', code: 'DEL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENG' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: 'mgr' | 'emp' | 'peer', manager: string | null) =>
      (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: addDays(week, -60), userId: users[who], workEmail: `${who}@tsn-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
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
    await api('admin', 'put', '/projects/settings').send({ changes: [{ key: 'projects.enabled', value: 'on' }] }).expect(want(200));
    const project = async (code: string, body: Record<string, unknown>) => {
      const id = (await api('pmA', 'post', '/projects').send({ code, name: `Project ${code}`, ...body }).expect(want(201))).body.id as string;
      await api('pmA', 'post', `/projects/${id}/status`).send({ status: 'active', version: 1 }).expect(want(200));
      return id;
    };
    ids.nrp = await project('NRP', { billingModel: 'time_material', clientId: ids.tn, managerUserId: users.pmA, clientApprovesHours: true });
    ids.kav = await project('KAV', { billingModel: 'time_material', clientId: ids.ka, managerUserId: users.pmB, clientApprovesHours: true });
    ids.int = await project('INT', { billingModel: 'non_billable' });
    for (const [pid, percent] of [['nrp', 50], ['kav', 50], ['int', 10]] as const) await api('pmA', 'post', `/projects/${ids[pid]}/allocations`).send({ employeeId: ids.empEmp, fromOn: week, percent }).expect(want(201));
    await api('pmA', 'post', `/projects/${ids.int}/allocations`).send({ employeeId: ids.peerEmp, fromOn: week, percent: 10 }).expect(want(201));
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

  const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  const LINES = () => [
    { projectId: ids.nrp, activity: null, billable: true, minutes: [480, 480, 0, 0, 0, 0, 0] },
    { projectId: ids.kav, activity: null, billable: true, minutes: [0, 0, 480, 0, 0, 0, 0] },
  ];
  const setRule = (changes: { key: string; value: string }[]) => api('admin', 'put', '/projects/settings').send({ changes }).expect(want(200));
  type Approvals = { groups: { project: string; items: { lines: { note: string | null }[] }[] }[] };

  it('defaults: required, 200 words; the person sees the rule with the week; only settings holders change it', async () => {
    const wk = (await api('emp', 'get', `/time/me/timesheet?week=${week}`).expect(want(200))).body;
    expect(wk.noteRule).toEqual({ required: true, minWords: 200 });
    const s = (await api('admin', 'get', '/projects/settings').expect(want(200))).body;
    expect(s.values).toMatchObject({ 'timesheet.note.required': 'on', 'timesheet.note.min_words': '200' });
    await api('emp', 'put', '/projects/settings').send({ changes: [{ key: 'timesheet.note.min_words', value: '10' }] }).expect(403);
  });

  it('Save draft works without a note; Submit is refused at 199 words and accepted at 200', async () => {
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines: LINES() }).expect(want(200));
    const empty = (await api('emp', 'post', '/time/me/timesheet/submit').send({ week }).expect(400)).body;
    expect(empty).toMatchObject({ code: 'NOTE_TOO_SHORT' });
    expect(empty.message).toMatch(/NRP: write at least 200 words about the work \(0 so far\)/);
    // 199 words on one row, 200 on the other: refused, naming the short row only.
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [{ ...LINES()[0], note: words(199) }, { ...LINES()[1], note: words(200) }] }).expect(want(200));
    const short = (await api('emp', 'post', '/time/me/timesheet/submit').send({ week }).expect(400)).body.message as string;
    expect(short).toMatch(/NRP: write at least 200 words about the work \(199 so far\)/);
    expect(short).not.toMatch(/KAV/);
    expect((await inA((tx) => tx.timesheet.findFirstOrThrow({ where: { employeeId: ids.empEmp, weekStart: day(week) } }))).status).toBe('draft');
    // A note over 4,000 characters is refused at save.
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [{ ...LINES()[0], note: 'x'.repeat(4001) }] }).expect(400);
    await api('emp', 'put', '/time/me/timesheet').send({ week, lines: [{ ...LINES()[0], note: `Built the checkout. ${words(198)}` }, { ...LINES()[1], note: words(200) }] }).expect(want(200));
    await api('emp', 'post', '/time/me/timesheet/submit').send({ week }).expect(want(200));
    expect((await lineOf(ids.nrp!)).note).toMatch(/^Built the checkout\./);
  });

  it('a PM reads the notes of their own project rows only; nobody else in the approvals list', async () => {
    const a = (await api('pmA', 'get', '/time/line-approvals').expect(want(200))).body as Approvals;
    expect(a.groups.map((g) => g.project)).toEqual(['NRP']);
    expect(a.groups[0]!.items[0]!.lines[0]!.note).toMatch(/^Built the checkout\./);
    expect(JSON.stringify(a)).not.toContain('word199'); // KAV's 200-word note never reaches PM A
    const b = (await api('pmB', 'get', '/time/line-approvals').expect(want(200))).body as Approvals;
    expect(b.groups.map((g) => g.project)).toEqual(['KAV']);
    expect(JSON.stringify(b)).not.toContain('Built the checkout');
    expect((await api('mgr', 'get', '/time/line-approvals').expect(want(200))).body.groups).toEqual([]);
    expect((await api('peer', 'get', '/time/line-approvals').expect(want(200))).body.groups).toEqual([]);
    for (const [who, pid] of [['pmA', 'nrp'], ['pmB', 'kav']] as const) {
      const l = await lineOf(ids[pid]!);
      await api(who, 'post', '/time/line-approvals/decide').send({ decisions: [{ lineId: l.id, status: 'approved', version: l.version }] }).expect(want(200));
    }
  });

  it('the client sees notes only when the project shows them (off by default)', async () => {
    // KAV is Coromandel's project, its hours approved by the client line by line (Nilgiri's NRP hours go to emp's placement).
    const me = async () => ((await portal('get', '/me', tokens.ka!).expect(want(200))).body.projectHours as { project: string; workNote: string | null }[]).filter((x) => x.project.startsWith('KAV'));
    expect((await me()).map((x) => x.workNote)).toEqual([null]);
    const p = (await api('pmB', 'get', `/projects/${ids.kav}`).expect(want(200))).body.project as { version: number; clientSeesNotes: boolean };
    expect(p.clientSeesNotes).toBe(false);
    await api('pmA', 'put', `/projects/${ids.kav}`).send({ code: 'KAV', name: 'Project KAV', billingModel: 'time_material', clientId: ids.ka, managerUserId: users.pmB, clientApprovesHours: true, clientSeesNotes: true, version: p.version }).expect(want(200));
    expect((await me())[0]!.workNote).toBe(words(200));
    // Nilgiri's contact never sees Coromandel's notes.
    expect(JSON.stringify((await portal('get', '/me', tokens.tn!).expect(want(200))).body)).not.toContain('word199');
  });

  it('Projects finance reads the notes with the unbilled hours', async () => {
    const nrp = await lineOf(ids.nrp!);
    await inA((tx) => tx.timesheetLine.update({ where: { id: nrp.id }, data: { clientStatus: 'approved' } }));
    const b = (await api('fin', 'get', `/projects/billing?month=${week.slice(0, 7)}`).expect(want(200))).body as { wip: { project: string; notes: string[] }[] };
    expect(b.wip.find((w) => w.project === 'NRP')?.notes?.[0]).toMatch(/^Built the checkout\./);
  });

  it('the setting off allows an empty note; a lower minimum is what the person sees', async () => {
    await setRule([{ key: 'timesheet.note.required', value: 'off' }]);
    await api('peer', 'put', '/time/me/timesheet').send({ week, lines: [{ projectId: ids.int, activity: null, billable: false, minutes: [60, 0, 0, 0, 0, 0, 0] }] }).expect(want(200));
    await api('peer', 'post', '/time/me/timesheet/submit').send({ week }).expect(want(200));
    await setRule([{ key: 'timesheet.note.required', value: 'on' }, { key: 'timesheet.note.min_words', value: '10' }]);
    expect((await api('emp', 'get', `/time/me/timesheet?week=${week}`).expect(want(200))).body.noteRule).toEqual({ required: true, minWords: 10 });
  });
});
