import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { WorkforceService } from '../src/people/workforce.service';
import { addDays, localDate, todayIst } from '../src/org-structure/org-validation';

// People › Directory on the designed screen (PPL-01, design audit step 2), against the real database (forced RLS):
// colleagues get Public fields only; ID, joining date and status follow employee.profile.view and its scope; phone
// follows employee.personal.view; consultants only for the consultant keys; distinct persons; the company filter;
// saved views; export; and the monthly snapshots behind "vs last month".
describe('People directory: workforce, cards, views, export (PPL-01; P02 Q4, §4.3–4.4, YX-SEC-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let workforce: WorkforceService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const joined = addDays(todayIst(), -400);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hrA' | 'hrTn' | 'empA' | 'outsiderA' | 'adminB';
  const api = (who: Who, method: 'get' | 'post' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@dir.test`;
  const list = async (who: Who, q = '') => (await api(who, 'get', `/people/workforce${q}`).expect(200)).body;
  const byId = (body: { rows: { id: string }[] }, id: string) => body.rows.find((r) => r.id === id) as Record<string, unknown> | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    workforce = moduleRef.get(WorkforceService);

    planId = (await prisma.plan.create({ data: { name: `dir-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `dir-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Company A has two entities (KF, TN); B has one.
    const masters = async (k: 'A' | 'B', tag: string, isDefault: boolean) =>
      tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${tag}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${tag}`, shortName: tag, isDefault } })).id;
        ids[`loc${tag}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${tag}`], name: `Site ${tag}`, code: tag, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        await tx.department.create({ data: { ...o, id, name: `Dept ${tag}`, code: `D${tag}`, path: `/${id}/` } });
        ids[`dept${tag}`] = id;
        ids[`des${tag}`] = (await tx.designation.create({ data: { ...o, name: `Analyst ${tag}`, code: `AN${tag}` } })).id;
        ids[`grade${tag}`] = (await tx.grade.create({ data: { ...o, name: `G2 ${tag}`, code: `G2${tag}`, rank: 2 } })).id;
        ids[`type${tag}`] = (await tx.employmentType.create({ data: { ...o, name: `Permanent ${tag}`, code: `P${tag}`, category: 'permanent' } })).id;
      });
    await masters('A', 'KF', true);
    await masters('A', 'TN', false);
    await masters('B', 'BB', true);

    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hr = await profile(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'employee.personal.view', 'consultant.manage'], 'HR');
    ids.records = await profile(['employee.profile.view'], 'Records');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['hrA', 'A', 'panel', hr],
      ['hrTn', 'A', 'panel', null],
      ['empA', 'A', 'panel', null],
      ['outsiderA', 'A', 'panel', null],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    // A Plant HR whose records grant reaches only the TN entity (P02 §4.3).
    await tenantPrisma.forTenant(ctx('A'), (tx) =>
      tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.hrTn, permissionProfileId: ids.records, scopeType: 'legal_entity', legalEntityId: ids.leTN, validFrom: new Date(`${addDays(todayIst(), -30)}T00:00:00Z`), status: 'active', reason: 'Plant HR' } }),
    );
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }

    const hire = async (who: Who, tag: string, body: Record<string, unknown>) =>
      (
        await api(who, 'post', '/people/employees')
          .send({
            legalEntityId: ids[`le${tag}`],
            status: 'confirmed',
            reason: 'Joined',
            overrideReason: 'Joined before go-live',
            joinedOn: joined,
            assignment: { locationId: ids[`loc${tag}`], departmentId: ids[`dept${tag}`], designationId: ids[`des${tag}`], gradeId: ids[`grade${tag}`], employmentTypeId: ids[`type${tag}`], managerEmployeeId: null },
            ...body,
          })
          .expect(201)
      ).body.id as string;
    ids.arjun = await hire('hrA', 'KF', { givenName: 'Arjun', familyName: 'Kulkarni', workEmail: email('empA'), userId: users.empA, mobilePhone: '098450 12345' });
    ids.meera = await hire('hrA', 'KF', { givenName: 'Meera', familyName: 'Iyer', workEmail: `meera-${runId}@dir.test` });
    ids.imran = await hire('hrA', 'TN', { givenName: 'Imran', workEmail: `imran-${runId}@dir.test` });
    ids.bina = await hire('adminB', 'BB', { givenName: 'Bina', workEmail: `bina-${runId}@dir.test` });
    // Consultants (payroll 5h): one is Meera herself (same email), so two roles, one person.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leKF},${ids.leTN}}`}, true)`;
      const base = { organizationId: org.A.id, panStatus: 'missing', defaultSection: '194J_B', createdBy: users.hrA };
      ids.konMeera = (await tx.consultant.create({ data: { ...base, legalEntityId: ids.leKF, name: 'Meera Iyer', kind: 'individual', email: `meera-${runId}@dir.test` } })).id;
      ids.konFirm = (await tx.consultant.create({ data: { ...base, legalEntityId: ids.leTN, name: '=SUM(1,2) Advisory', kind: 'firm', email: `firm-${runId}@dir.test` } })).id;
    });
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('Position view: open job openings as vacancies under their hiring manager, for HR and the hiring manager only', async () => {
    const job = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.job.create({ data: { organizationId: org.A.id, title: 'Quality Inspector', status: 'open', createdById: users.hrA, hiringManagerId: users.empA, designationId: ids.desKF, departmentId: ids.deptKF, locationId: ids.locKF, headcount: 2 } }));
    const hr = (await api('hrA', 'get', '/people/org-chart').expect(200)).body;
    expect(hr.vacancies).toEqual([{ id: `job:${job.id}`, role: 'Analyst KF', department: 'Dept KF', location: 'Site KF', managerId: ids.arjun, openings: 2 }]);
    expect(JSON.stringify(hr.vacancies)).not.toMatch(/candidate|applicant/i);
    expect((await api('empA', 'get', '/people/org-chart').expect(200)).body.vacancies).toHaveLength(1); // the hiring manager's own
    expect((await api('hrTn', 'get', '/people/org-chart').expect(200)).body.vacancies).toEqual([]); // scoped HR without hiring access
    expect((await api('adminB', 'get', '/people/org-chart').expect(200)).body.vacancies).toEqual([]);
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.job.delete({ where: { id: job.id } }));
  });

  it('Position view by company (founder 21 Oct 2026): the job’s entity, else its location’s, else its hiring manager’s; none of these shows under All entities only; the switch stays on past dates', async () => {
    const make = (title: string, extra: Record<string, string>) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.job.create({ data: { organizationId: org.A.id, title, status: 'open', createdById: users.hrA, ...extra } }));
    const company = await make('Plant Engineer', {});
    const byLocation = await make('Line Lead', { locationId: ids.locTN });
    const byManager = await make('Quality Analyst', { hiringManagerId: users.empA }); // Arjun works for KF
    const own = await make('Store Keeper', { legalEntityId: ids.leTN, locationId: ids.locKF }); // the job's own entity wins
    const chart = async (q: string) => (await api('hrA', 'get', `/people/org-chart${q}`).expect(200)).body as { positions: boolean; vacancies: { id: string }[] };
    const jobs = (b: { vacancies: { id: string }[] }) => b.vacancies.map((x) => x.id).sort();
    const all = await chart('');
    expect(all.positions).toBe(true);
    expect(jobs(all)).toEqual([company, byLocation, byManager, own].map((j) => `job:${j.id}`).sort());
    expect(jobs(await chart(`?legalEntityId=${ids.leKF}`))).toEqual([`job:${byManager.id}`]);
    expect(jobs(await chart(`?legalEntityId=${ids.leTN}`))).toEqual([byLocation, own].map((j) => `job:${j.id}`).sort());
    // Openings are not dated: a past chart has none, but HR keeps the switch (the screen says why it is empty).
    const past = await chart('?asOf=2026-07-01');
    expect(past).toMatchObject({ positions: true, vacancies: [] });
    // The hiring manager keeps the switch for their own opening; scoped HR without hiring access has none.
    expect((await api('empA', 'get', '/people/org-chart').expect(200)).body).toMatchObject({ positions: true, vacancies: [{ id: `job:${byManager.id}` }] });
    expect((await api('hrTn', 'get', '/people/org-chart').expect(200)).body).toMatchObject({ positions: false, vacancies: [] });
    expect((await api('adminB', 'get', '/people/org-chart').expect(200)).body.vacancies).toEqual([]);
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.job.deleteMany({ where: { id: { in: [company, byLocation, byManager, own].map((j) => j.id) } } }));
  });

  it('a colleague sees Public fields only: no ID, status, joining date, phone or consultants', async () => {
    const body = await list('empA');
    expect(body.rows.map((r: { id: string }) => r.id).sort()).toEqual([ids.arjun, ids.meera, ids.imran].sort());
    for (const r of body.rows) for (const k of ['employeeCode', 'joinedOn', 'status', 'phone']) expect(r).not.toHaveProperty(k);
    expect(body.cards.consultants).toBeNull();
    expect(body.cards.persons).toMatchObject({ roles: 3, people: 3 });
    expect(body.me).toMatchObject({ id: ids.arjun, departmentId: ids.deptKF, locationId: ids.locKF });
  });

  it('company-wide HR sees ID, status and phone; consultants with the key; a person with two roles counts once', async () => {
    const body = await list('hrA');
    expect(byId(body, ids.arjun)).toMatchObject({ employeeCode: expect.any(String), status: 'Active', phone: '+919845012345' });
    expect(byId(body, ids.meera)).toMatchObject({ status: 'Active' });
    expect(byId(body, ids.meera)).not.toHaveProperty('phone'); // no phone on file
    expect(body.rows.filter((r: { kind: string }) => r.kind === 'consultant')).toHaveLength(2);
    expect(body.cards).toMatchObject({ employees: { count: 3 }, consultants: { count: 2 }, persons: { roles: 5, people: 4 } });
    expect(body.me).toBeNull();
  });

  it('scoped HR with no record of their own lists only the people the grant reaches (no blank rows), no phone without the Personal key', async () => {
    const body = await list('hrTn');
    expect(byId(body, ids.imran)).toMatchObject({ employeeCode: expect.any(String), status: 'Active' });
    // PPL-01 audit: out-of-scope people are not listed with blanked ID and status; the card counts what is listed.
    expect(body.rows.find((r: { id: string }) => r.id === ids.arjun)).toBeUndefined();
    for (const r of body.rows) expect(r).toMatchObject({ employeeCode: expect.any(String), status: expect.any(String) });
    expect(body.cards.employees.count).toBe(body.rows.length);
    for (const r of body.rows) expect(r).not.toHaveProperty('phone');
    expect(body.cards.consultants).toBeNull();
  });

  it('the company switcher scopes rows and cards; nothing crosses companies; no record and no key is refused', async () => {
    const tn = await list('hrA', `?legalEntityId=${ids.leTN}`);
    expect(tn.rows.map((r: { id: string }) => r.id).sort()).toEqual([ids.imran, ids.konFirm].sort());
    expect(tn.cards).toMatchObject({ employees: { count: 1 }, consultants: { count: 1 }, persons: { roles: 2, people: 2 } });
    const b = await list('adminB');
    expect(b.rows.map((r: { id: string }) => r.id)).toEqual([ids.bina]);
    expect(JSON.stringify(b)).not.toContain(ids.arjun);
    expect((await list('hrA', `?legalEntityId=${ids.leBB}`)).rows).toEqual([]);
    await api('outsiderA', 'get', '/people/workforce').expect(403);
    await api('hrA', 'get', '/people/workforce?legalEntityId=nope').expect(400);
  });

  it('export: HR only, the fields the person may see, formulas neutralised, and recorded', async () => {
    await api('empA', 'post', '/people/workforce/export').send({ columns: ['name'] }).expect(403);
    const csv = (await api('hrTn', 'post', '/people/workforce/export').send({ columns: ['name', 'code', 'phone'] }).expect(200)).text;
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('"Name","ID","Phone"');
    expect(lines.find((l) => l.startsWith('"Arjun'))).toBeUndefined(); // outside the plant HR's grant: not listed
    expect(lines.find((l) => l.startsWith('"Imran'))).toMatch(/^"Imran","[^"]+",""$/);
    const all = (await api('hrA', 'post', '/people/workforce/export').send({ columns: ['name', 'phone'], ids: [ids.arjun, ids.konFirm] }).expect(200)).text;
    expect(all.split('\r\n')).toEqual(['"Name","Phone"', '"Arjun Kulkarni","+919845012345"', `"'=SUM(1,2) Advisory",""`]);
    await api('hrA', 'post', '/people/workforce/export').send({ columns: ['salary'] }).expect(400);
    const xlsx = await api('hrA', 'post', '/people/workforce/export').send({ columns: ['name'], format: 'xlsx' }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // a zip: the workbook
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'people.directory.exported' } }));
    expect(rows).toHaveLength(3);
  });

  it('saved views: mine and shared; another person sees only the shared ones and cannot delete them', async () => {
    const mine = (await api('hrA', 'post', '/people/workforce/views').send({ name: 'Plant only', shared: false, state: { quick: null, q: 'Imran' } }).expect(201)).body;
    const shared = (await api('hrA', 'post', '/people/workforce/views').send({ name: 'Joined this year', shared: true, state: { q: '' } }).expect(201)).body;
    expect((await api('hrA', 'get', '/people/workforce/views').expect(200)).body.map((v: { name: string }) => v.name)).toEqual(['Joined this year', 'Plant only']);
    const theirs = (await api('empA', 'get', '/people/workforce/views').expect(200)).body;
    expect(theirs).toEqual([{ id: shared.id, name: 'Joined this year', shared: true, state: { q: '' }, mine: false }]);
    await api('empA', 'delete', `/people/workforce/views/${shared.id}`).expect(404);
    // Only HR may put a view in everyone's View menu; a colleague keeps theirs private.
    await api('empA', 'post', '/people/workforce/views').send({ name: 'Everyone', shared: true, state: {} }).expect(403);
    const own = (await api('empA', 'post', '/people/workforce/views').send({ name: 'Mine', shared: false, state: {} }).expect(201)).body;
    await api('empA', 'delete', `/people/workforce/views/${own.id}`).expect(200);
    expect((await api('adminB', 'get', '/people/workforce/views').expect(200)).body).toEqual([]);
    await api('hrA', 'post', '/people/workforce/views').send({ name: 'Big', shared: false, state: { x: 'y'.repeat(5000) } }).expect(400);
    await api('hrA', 'delete', `/people/workforce/views/${mine.id}`).expect(200);
  });

  it('status per person comes from the modules: probation, notice period (status or an accepted exit), on leave today', async () => {
    const today = todayIst();
    ids.kiran = (await api('hrA', 'post', '/people/employees').send({
      legalEntityId: ids.leTN, status: 'probation', reason: 'Joined', joinedOn: addDays(today, -10), givenName: 'Kiran', workEmail: `kiran-${runId}@dir.test`,
      assignment: { locationId: ids.locTN, departmentId: ids.deptTN, designationId: ids.desTN, gradeId: ids.gradeTN, employmentTypeId: ids.typeTN, managerEmployeeId: null },
    }).expect(201)).body.id;
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const m = await tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.arjun }, select: { id: true } });
      const { personId } = await tx.employee.findFirstOrThrow({ where: { organizationId: org.A.id, id: ids.arjun }, select: { personId: true } });
      await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: m.id, employeeId: ids.arjun, personId, exitType: 'resignation', initiatedBy: 'employee', submittedOn: new Date(`${today}T00:00:00Z`), noticePeriod: '30d', standardLwd: new Date(`${addDays(today, 30)}T00:00:00Z`), status: 'submitted' } });
      ids.arjunExit = (await tx.exitCase.findFirstOrThrow({ where: { organizationId: org.A.id, employmentId: m.id }, select: { id: true } })).id;
      const type = await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'CL', name: 'Casual leave', kind: 'casual' } });
      await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: ids.meera, leaveTypeId: type.id, fromOn: new Date(`${today}T00:00:00Z`), toOn: new Date(`${today}T00:00:00Z`), days: 1, status: 'approved' } });
    });
    // A resignation HR has not accepted yet is not a notice period.
    expect(byId(await list('hrA'), ids.arjun)?.status).toBe('Active');
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.exitCase.update({ where: { id: ids.arjunExit }, data: { status: 'accepted', approvedLwd: new Date(`${addDays(today, 30)}T00:00:00Z`) } }));
    const body = await list('hrA');
    expect([byId(body, ids.kiran)?.status, byId(body, ids.arjun)?.status, byId(body, ids.meera)?.status, byId(body, ids.imran)?.status]).toEqual(['Probation', 'Notice period', 'On leave', 'Active']);
    // A colleague never learns who is on leave or leaving.
    expect(JSON.stringify(await list('empA'))).not.toMatch(/On leave|Notice period|Probation/);
  });

  it('monthly snapshots: one per company and entity, idempotent; "vs last month" only once last month exists', async () => {
    expect((await list('hrA')).cards.employees.previous).toBeNull();
    expect(await workforce.snapshot(org.A.id)).toBe(3); // the company, KF and TN
    expect(await workforce.snapshot(org.A.id)).toBe(3);
    const rows = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.workforceSnapshot.findMany({ where: { organizationId: org.A.id } }));
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.legalEntityId === null)).toMatchObject({ employees: 4, consultants: 2, persons: 5, employeePersons: 4 });
    // Last month, as the job would have left it.
    const last = new Date(`${todayIst().slice(0, 7)}-01T00:00:00Z`);
    last.setUTCMonth(last.getUTCMonth() - 1);
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.workforceSnapshot.create({ data: { organizationId: org.A.id, legalEntityId: null, month: last, employees: 2, consultants: 1, persons: 3, employeePersons: 2 } }));
    const hr = await list('hrA');
    expect(hr.cards).toMatchObject({ employees: { count: 4, previous: 2 }, consultants: { previous: 1 }, persons: { previous: 3 } });
    expect(hr.previousMonth).toBe(last.toISOString().slice(0, 7));
    expect((await list('empA')).cards.persons.previous).toBe(2); // employees only, for someone without the consultant keys
    expect((await list('hrA', `?legalEntityId=${ids.leTN}`)).cards.employees.previous).toBeNull(); // no TN row last month
  });

  it("each entity counts on its own date: a far-east site's new joiner is in, a far-west site's is not yet", async () => {
    // UTC+14 and UTC-11 are always on different dates, so this holds at any hour.
    const east = localDate(new Date(), 'Pacific/Kiritimati');
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      await tx.location.update({ where: { id: ids.locTN }, data: { timezone: 'Pacific/Kiritimati' } });
      await tx.location.update({ where: { id: ids.locKF }, data: { timezone: 'Pacific/Pago_Pago' } });
      await tx.employment.updateMany({ where: { organizationId: org.A.id, employeeId: { in: [ids.imran, ids.meera] } }, data: { joinedOn: new Date(`${east}T00:00:00Z`) } });
    });
    const body = await list('hrA');
    expect(byId(body, ids.imran)).toBeDefined(); // joined today in TN's time
    expect(byId(body, ids.meera)).toBeUndefined(); // still tomorrow in KF's time
    expect((await list('hrA', `?legalEntityId=${ids.leTN}`)).asOf).toBe(east);
  });

  it('each row names its department and those above it, top first (the parent department filter)', async () => {
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const id = randomUUID();
      await tx.department.create({ data: { organizationId: org.A.id, id, name: 'Operations', code: 'OPS', path: `/${id}/` } });
      await tx.department.update({ where: { id: ids.deptTN }, data: { parentId: id, path: `/${id}/${ids.deptTN}/` } });
    });
    const body = await list('empA');
    expect(byId(body, ids.imran)?.departmentPath).toEqual(['Operations', 'Dept TN']);
    expect(byId(body, ids.arjun)?.departmentPath).toEqual(['Dept KF']);
  });

  it('the org chart follows the top bar entity; a manager in another entity is a quiet line, never lost', async () => {
    const ravi = (
      await api('hrA', 'post', '/people/employees')
        .send({ legalEntityId: ids.leTN, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, givenName: 'Ravi', workEmail: `ravi-${runId}@dir.test`, assignment: { locationId: ids.locTN, departmentId: ids.deptTN, designationId: ids.desTN, gradeId: ids.gradeTN, employmentTypeId: ids.typeTN, managerEmployeeId: ids.arjun } })
        .expect(201)
    ).body.id as string;
    const tn = (await api('hrA', 'get', `/people/org-chart?legalEntityId=${ids.leTN}`).expect(200)).body.nodes as { id: string; legalEntity: { id: string } | null; managerId: string | null; managerOutside?: { name: string; legalEntity: string | null } }[];
    expect(tn.map((n) => n.id)).toContain(ravi);
    expect(tn.every((n) => n.legalEntity?.id === ids.leTN)).toBe(true);
    expect(tn.map((n) => n.id)).not.toContain(ids.arjun);
    expect((await api('hrA', 'get', `/people/org-chart?legalEntityId=${ids.leTN}`).expect(200)).body.truncated).toBe(false);
    expect(tn.find((n) => n.id === ravi)).toMatchObject({ managerId: null, managerOutside: { name: 'Arjun Kulkarni', legalEntity: 'Entity KF' } });
    const everyone = (await api('hrA', 'get', '/people/org-chart').expect(200)).body.nodes as { id: string; managerId: string | null }[];
    expect(everyone.find((n) => n.id === ravi)!.managerId).toBe(ids.arjun);
    // Another company's entity id shows nothing of A.
    expect((await api('adminB', 'get', `/people/org-chart?legalEntityId=${ids.leTN}`).expect(200)).body.nodes).toEqual([]);
  });
});
