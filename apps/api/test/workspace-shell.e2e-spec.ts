import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';

// The app frame's data (design audit step 1): global search (Ctrl K) and side-menu counts, against the real database
// (forced RLS, app role). Nothing crosses companies, and each section shows only what its page would let the person open.
describe('Workspace search and counts (design shell step 1; P02 §4.3, YX-SEC-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const joined = addDays(todayIst(), -400);
  // A word no other test data uses, so every hit below comes from this file.
  const WORD = `Zephyr${runId}`;

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'adminA' | 'adminB' | 'hrA' | 'arjunA' | 'outsiderA';
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@ws.test`;
  const search = async (who: Who, q: string) => (await api(who, 'get', `/workspace/search?q=${encodeURIComponent(q)}`).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `ws-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `ws-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      await tenantPrisma.forTenant(ctx(k), async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`le${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Entity ${k}`, shortName: `E${k}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`le${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
        const id = randomUUID();
        await tx.department.create({ data: { ...o, id, name: 'Ops', code: 'OPS', path: `/${id}/` } });
        ids[`dept${k}`] = id;
        ids[`des${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`grade${k}`] = (await tx.grade.create({ data: { ...o, name: 'G2', code: 'G2', rank: 2 } })).id;
        ids[`type${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const hr = (await tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name: 'HR', permissionsJson: JSON.stringify(['employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override', 'document.manage', 'lifecycle.exit.view']) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrA', 'A', 'panel', hr],
      ['arjunA', 'A', 'panel', null],
      ['outsiderA', 'A', 'panel', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }

    const hire = async (who: Who, k: 'A' | 'B', body: Record<string, unknown>) =>
      (
        await api(who, 'post', '/people/employees')
          .send({
            legalEntityId: ids[`le${k}`],
            status: 'confirmed',
            reason: 'Joined',
            overrideReason: 'Joined before go-live',
            joinedOn: joined,
            assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`des${k}`], gradeId: ids[`grade${k}`], employmentTypeId: ids[`type${k}`], managerEmployeeId: null },
            ...body,
          })
          .expect(201)
      ).body.id as string;
    ids.arjun = await hire('hrA', 'A', { givenName: 'Arjun', familyName: 'Kulkarni', workEmail: email('arjunA'), userId: users.arjunA });
    ids.zA = await hire('hrA', 'A', { givenName: WORD, familyName: 'Rao', workEmail: `za-${runId}@ws.test` });
    ids.zB = await hire('adminB', 'B', { givenName: WORD, familyName: 'Bose', workEmail: `zb-${runId}@ws.test` });

    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant(ctx(k), async (tx) => {
        ids[`cand${k}`] = (await tx.candidate.create({ data: { organizationId: org[k].id, email: `cand-${k}-${runId}@ws.test`, name: `${WORD} Candidate ${k}` } })).id;
      });
    }
    // Requests: Arjun's own; one HR raised that Arjun has a task on; one Arjun has nothing to do with.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const req = (title: string, requesterUserId: string) =>
        tx.wfRequest.create({ data: { organizationId: org.A.id, requestType: 'leave.request', subjectType: 'employee', subjectId: ids.arjun, title, steps: [], requesterUserId, status: 'pending', currentStep: 0 } });
      ids.reqOwn = (await req(`${WORD} laptop for Arjun`, users.arjunA)).id;
      ids.reqTask = (await req(`${WORD} leave for HR`, users.hrA)).id;
      ids.reqOther = (await req(`${WORD} private to HR`, users.hrA)).id;
      await tx.wfTask.create({ data: { organizationId: org.A.id, requestId: ids.reqTask, step: 0, assigneeUserId: users.arjunA, status: 'open' } });
      await tx.userNotification.create({ data: { organizationId: org.A.id, recipientUserId: users.arjunA, type: 'test', entityType: 'wf_request', entityId: ids.reqTask, linkPath: '/yx/approvals' } });
    });
    await tenantPrisma.forTenant(ctx('B'), (tx) =>
      tx.wfRequest.create({ data: { organizationId: org.B.id, requestType: 'leave.request', subjectType: 'employee', subjectId: ids.zB, title: `${WORD} B request`, steps: [], requesterUserId: users.adminB, status: 'pending', currentStep: 0 } }),
    );
    // A help-desk ticket Arjun raised.
    const desk = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help desk', key: 'IT', kind: 'it' }).expect(201)).body;
    const full = (await api('adminA', 'get', `/desk/desks/${desk.id}`).expect(200)).body;
    const category = full.categories[0].id;
    ids.ticket = (await api('arjunA', 'post', '/desk/my/tickets').send({ deskId: desk.id, categoryId: category, subject: `${WORD} VPN will not connect`, description: 'Since this morning.' }).expect(201)).body.id;
  }, 120_000);

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

  const idsOf = (hits: { id: string }[]) => hits.map((h) => h.id).sort();

  it('never returns another company: people, requests and candidates stay in the caller company', async () => {
    const a = await search('adminA', WORD);
    expect(idsOf(a.people)).toEqual([ids.zA]);
    expect(idsOf(a.candidates)).toEqual([ids.candA]);
    const b = await search('adminB', WORD);
    expect(idsOf(b.people)).toEqual([ids.zB]);
    expect(idsOf(b.candidates)).toEqual([ids.candB]);
    expect(JSON.stringify(b)).not.toContain(ids.zA);
    expect(JSON.stringify(a)).not.toContain(ids.zB);
  });

  it('people: HR in scope gets the profile link and code; an employee gets Public fields and a directory link', async () => {
    const hr = await search('hrA', WORD);
    expect(hr.people).toHaveLength(1);
    expect(hr.people[0].href).toBe(`/yx/people/profile?person=${ids.zA}`);
    const emp = await search('arjunA', WORD);
    expect(emp.people).toHaveLength(1);
    expect(emp.people[0].href).toMatch(/^\/yx\/people\/directory\?q=/);
    expect(emp.people[0].secondary).not.toMatch(/EMP|\d{3}/);
  });

  it('people: someone with no employee record and no HR key gets no people at all', async () => {
    const out = await search('outsiderA', WORD);
    expect(out).toEqual({ people: [], requests: [], candidates: [], tickets: [] });
  });

  it('requests: only those the person asked for, raised, or holds a task on', async () => {
    expect(idsOf((await search('arjunA', WORD)).requests)).toEqual([ids.reqOwn, ids.reqTask].sort());
    expect(idsOf((await search('hrA', WORD)).requests)).toEqual([ids.reqTask, ids.reqOther].sort());
    // An org admin sees no one else's request through search: Approvals would not open it either.
    expect((await search('adminA', WORD)).requests).toEqual([]);
  });

  it('candidates: only with a hiring key; tickets: only the person raised them', async () => {
    expect((await search('hrA', WORD)).candidates).toEqual([]);
    expect((await search('arjunA', WORD)).candidates).toEqual([]);
    const emp = await search('arjunA', WORD);
    expect(idsOf(emp.tickets)).toEqual([ids.ticket]);
    expect((await search('hrA', WORD)).tickets).toEqual([]);
  });

  it('rejects over-long input, ignores one-letter input, and treats LIKE wildcards literally', async () => {
    await api('arjunA', 'get', `/workspace/search?q=${'x'.repeat(101)}`).expect(400);
    expect(await search('adminA', 'Z')).toEqual({ people: [], requests: [], candidates: [], tickets: [] });
    expect((await search('adminA', '%%')).candidates).toEqual([]);
    await request(server()).get('/api/v1/workspace/search?q=ab').expect(401);
  });

  it('answers in under 300 ms', async () => {
    await search('hrA', WORD); // warm-up
    for (const who of ['hrA', 'arjunA', 'adminA'] as const) {
      const t = Date.now();
      await search(who, WORD);
      expect(Date.now() - t).toBeLessThan(300);
    }
  });

  it('counts: each only for someone who may open its page', async () => {
    const arjun = (await api('arjunA', 'get', '/workspace/counts').expect(200)).body;
    expect(arjun.approvals).toBe(1);
    expect(arjun.notifications).toBe(1);
    expect(arjun.documentsToVerify).toBeUndefined();
    expect(arjun.payslipQueries).toBeUndefined();
    const admin = (await api('adminA', 'get', '/workspace/counts').expect(200)).body;
    expect(admin.approvals).toBe(0);
    // A System Admin does not hold document.manage by default (P02 §4.6), so no documents count either.
    expect(admin.documentsToVerify).toBeUndefined();
    const hr = (await api('hrA', 'get', '/workspace/counts').expect(200)).body;
    expect(hr.documentsToVerify).toBe(0);
    expect(hr.exitCases).toBe(0);
    const b = (await api('adminB', 'get', '/workspace/counts').expect(200)).body;
    expect(b.approvals).toBe(0);
    expect(b.notifications).toBe(0);
  });

  // Home widgets (design audit step 2): counts from the owning modules' own rules, following the company switcher.
  it('home: attendance exceptions only for an attendance.view holder, in their company and the chosen entity', async () => {
    const month = todayIst().slice(0, 7);
    const day = `${month}-01`;
    await tenantPrisma.forTenant(ctx('A'), (tx) => tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: ids.zA, workOn: new Date(`${day}T00:00:00Z`), mode: 'punch', status: 'missing_out' } }));
    const other = (await tenantPrisma.forTenant(ctx('A'), (tx) => tx.legalEntity.create({ data: { organizationId: org.A.id, name: 'Entity A2', shortName: 'EA2' } }))).id;
    const home = async (who: Who, q = '') => (await api(who, 'get', `/workspace/home?month=${month}${q}`).expect(200)).body;
    expect((await home('adminA')).attendanceExceptions).toBe(1);
    expect((await home('adminA', `&legalEntityId=${ids.leA}`)).attendanceExceptions).toBe(1);
    expect((await home('adminA', `&legalEntityId=${other}`)).attendanceExceptions).toBe(0);
    expect((await home('adminB')).attendanceExceptions).toBe(0);
    // No attendance key: no widget at all (not a zero).
    const arjun = await home('arjunA');
    expect(arjun).toEqual({ month });
    await api('adminA', 'get', '/workspace/home?month=2026-13').expect(400);
    await api('adminA', 'get', '/workspace/home?legalEntityId=not-a-uuid').expect(400);
    await request(server()).get('/api/v1/workspace/home').expect(401);
  });

  it('my requests (PLT-06): only what the person asked for, in their company', async () => {
    const mine = async (who: Who) => ((await api(who, 'get', '/workflow/approvals/mine').expect(200)).body as { requestId: string }[]).map((r) => r.requestId).sort();
    expect(await mine('arjunA')).toEqual([ids.reqOwn]);
    expect(await mine('hrA')).toEqual([ids.reqTask, ids.reqOther].sort());
    expect(await mine('adminA')).toEqual([]);
    expect(JSON.stringify(await mine('adminB'))).not.toContain(ids.reqOwn);
  });
});
