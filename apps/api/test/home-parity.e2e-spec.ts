import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { WorkspaceService } from '../src/workspace/workspace.service';
import { addDays, todayIst } from '../src/org-structure/org-validation';

// Home parity with the design (PLT-02, 19 Oct 2026): an approval names the person it is about; "vs last month" comes
// from the monthly Home snapshot and only for someone who sees all that it counted; "Coming up" shows birthdays (never
// the year, never a hidden one) and work anniversaries in the person's own circle; nothing crosses companies; the
// employee's own cards read only their own leave, attendance and requests.
describe('Home parity (PLT-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let workspace: WorkspaceService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const today = todayIst();
  const joined = addDays(today, -400);
  const month = today.slice(0, 7);
  const lastMonth = addDays(`${month}-01`, -1).slice(0, 7);
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'adminA' | 'adminB' | 'bossA' | 'arjunA' | 'peerA' | 'plainA';
  const api = (who: Who, path: string) => request(server()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@home.test`;
  const home = async (who: Who) => (await api(who, `/workspace/home?month=${month}`).expect(200)).body;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    workspace = moduleRef.get(WorkspaceService);

    planId = (await prisma.plan.create({ data: { name: `home-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Home ${k}`, slug: `home-${k.toLowerCase()}-${runId}`, planId } });
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
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [
      ['adminA', 'A', 'org_admin'],
      ['adminB', 'B', 'org_admin'],
      ['bossA', 'A', 'panel'],
      ['arjunA', 'A', 'panel'],
      ['peerA', 'A', 'panel'],
      ['plainA', 'A', 'panel'],
    ];
    for (const [name, k, role] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role } }))).id;
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    const hire = async (k: 'A' | 'B', given: string, extra: Record<string, unknown>, manager: string | null = null) =>
      (
        await request(server())
          .post('/api/v1/people/employees')
          .set('Authorization', `Bearer ${token[k === 'A' ? 'adminA' : 'adminB']}`)
          .send({
            legalEntityId: ids[`le${k}`],
            status: 'confirmed',
            reason: 'Joined',
            overrideReason: 'Joined before go-live',
            joinedOn: joined,
            givenName: given,
            familyName: 'Test',
            workEmail: `${given.toLowerCase()}-${runId}@home.test`,
            assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`des${k}`], gradeId: ids[`grade${k}`], employmentTypeId: ids[`type${k}`], managerEmployeeId: manager },
            ...extra,
          })
          .expect(201)
      ).body.id as string;
    ids.boss = await hire('A', 'Boss', { userId: users.bossA, workEmail: email('bossA') });
    ids.arjun = await hire('A', 'Arjun', { userId: users.arjunA, workEmail: email('arjunA') }, ids.boss);
    ids.peer = await hire('A', 'Priya', { userId: users.peerA, workEmail: email('peerA') }, ids.boss);
    ids.shy = await hire('A', 'Shy', {}, ids.boss);
    ids.far = await hire('A', 'Faraway', {});
    ids.bee = await hire('B', 'Bina', {});

    // Birthdays today: a teammate, a teammate who hid it, someone outside the circle, and someone in the other company.
    const born = `1990-${today.slice(5)}`;
    for (const [k, e, hide] of [['A', ids.peer, false], ['A', ids.shy, true], ['A', ids.far, false], ['B', ids.bee, false]] as const)
      await tenantPrisma.forTenant(ctx(k), (tx) => tx.employeePersonalDetails.upsert({ where: { organizationId_employeeId: { organizationId: org[k].id, employeeId: e } }, create: { organizationId: org[k].id, employeeId: e, dateOfBirth: new Date(`${born}T00:00:00Z`), hideBirthday: hide }, update: { dateOfBirth: new Date(`${born}T00:00:00Z`), hideBirthday: hide } }));

    // A leave request with no login behind it (an import), about Arjun, waiting for the boss.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const person = (await tx.employee.findFirstOrThrow({ where: { id: ids.arjun }, select: { personId: true } })).personId;
      const r = await tx.wfRequest.create({ data: { organizationId: org.A.id, requestType: 'leave.request', subjectType: 'employee', subjectId: ids.arjun, subjectPersonId: person, title: 'Casual leave, 27 Oct (1 day)', steps: [{ name: 'Manager', approverIds: [users.bossA], need: 1, state: 'waiting' }], requesterUserId: null, status: 'pending', currentStep: 0 } });
      await tx.wfTask.create({ data: { organizationId: org.A.id, requestId: r.id, step: 0, assigneeUserId: users.bossA, status: 'open' } });
      // Arjun's own request, and his teammate's: "Requests pending" reads only his.
      await tx.wfRequest.create({ data: { organizationId: org.A.id, requestType: 'leave.request', subjectType: 'employee', subjectId: ids.arjun, title: 'Arjun request', steps: [], requesterUserId: users.arjunA, status: 'pending', currentStep: 0 } });
      await tx.wfRequest.create({ data: { organizationId: org.A.id, requestType: 'leave.request', subjectType: 'employee', subjectId: ids.peer, title: 'Priya request', steps: [], requesterUserId: users.peerA, status: 'pending', currentStep: 0 } });
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

  it('an approval row names the person it is about, even with no requester login', async () => {
    const inbox = (await api('bossA', '/workflow/approvals/inbox').expect(200)).body as { title: string; person: string; requester: string }[];
    expect(inbox.find((t) => t.title.startsWith('Casual leave'))).toMatchObject({ person: 'Arjun Test', requester: '' });
  });

  it('"vs last month" comes from the stored month, only for a company-wide viewer, never from another company', async () => {
    expect(await workspace.snapshot(org.A.id)).toBeGreaterThan(0);
    const stored = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.homeSnapshot.findMany({ where: { organizationId: org.A.id, month: new Date(`${month}-01T00:00:00Z`), scopeId: null } }));
    expect(stored.map((r) => r.metric).sort()).toEqual(['attendance_exceptions', 'joining']);
    // Last month on record for A; a bigger number for B's same month must never reach A.
    for (const [k, value] of [['A', 5], ['B', 999]] as const)
      await tenantPrisma.forTenant(ctx(k), (tx) => tx.homeSnapshot.createMany({ data: ['attendance_exceptions', 'joining'].map((metric) => ({ organizationId: org[k].id, metric, month: new Date(`${lastMonth}-01T00:00:00Z`), value })) }));
    const a = await home('adminA');
    expect(a.attendanceExceptions).toBe(0);
    expect(a.joining).toBe(0);
    expect(a.previous).toEqual({ month: lastMonth, attendanceExceptions: 5, joining: 5 });
    expect((await home('adminB')).previous).toMatchObject({ attendanceExceptions: 999 });
    // No attendance or onboarding key: no cards and nothing to compare.
    const plain = await home('plainA');
    expect(plain).not.toHaveProperty('attendanceExceptions');
    expect(plain).not.toHaveProperty('previous');
  });

  it('"Coming up" shows birthdays in the person\'s own circle, day only, never a hidden one or another company\'s', async () => {
    const mine = (await home('arjunA')).celebrations as { name: string; kind: string; on: string }[];
    expect(mine).toEqual([{ id: `b-${ids.peer}`, name: 'Priya Test', kind: 'birthday', on: today }]);
    expect(JSON.stringify(mine)).not.toContain('1990');
    // The boss's circle is their reports: Arjun (no birthday), Priya, and Shy who hid it.
    expect(((await home('bossA')).celebrations as { name: string }[]).map((c) => c.name)).toEqual(['Priya Test']);
    // Someone with no employee record gets no section; the other company sees none of A's people.
    expect(await home('plainA')).not.toHaveProperty('celebrations');
    expect(await home('adminB')).not.toHaveProperty('celebrations');
  });

  it("the employee's own cards read only their own requests and attendance", async () => {
    const mine = (await api('arjunA', '/workflow/approvals/mine').expect(200)).body as { title: string }[];
    expect(mine.map((r) => r.title)).toEqual(['Arjun request']);
    const att = (await api('arjunA', `/time/me/attendance?month=${month}`).expect(200)).body;
    expect(att.employee.id).toBe(ids.arjun);
    const leave = await api('arjunA', '/time/me/leave');
    if (leave.status === 200) expect(leave.body.employee.id).toBe(ids.arjun);
  });
});
