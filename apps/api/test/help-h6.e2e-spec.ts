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

// Help and onboarding H-6 (founder answer 952), against the real database (forced RLS): the set-up hub shows, per area,
// how much is set up from what each area already knows, each check naming its set-up page. Only people who set up the
// company (org.settings.manage) see it; every other role is refused; a company sees only its own state.
describe('Help H-6: the set-up hub', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const joined = addDays(todayIst(), -400);

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'hr' | 'admin' | 'employee' | 'payroll' | 'access' | 'adminB' | 'acting';
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const email = (who: string) => `${who}-${runId}@helph6.test`;
  const ids: Record<string, string> = {};
  type Area = { id: string; checks: { id: string; done: boolean; blocking: boolean; href: string; starter?: boolean }[] };
  const hub = async (who: Who) => (await api(who, 'get', '/help/setup-hub').expect(200)).body as Area[];
  const done = (areas: Area[], area: string, check: string) => areas.find((a) => a.id === area)!.checks.find((c) => c.id === check)!.done;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `helph6-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Org ${k}`, slug: `helph6-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = (keys: string[], name: string) => tenantPrisma.forTenant(ctx('A'), (tx) => tx.permissionProfile.create({ data: { organizationId: org.A.id, name, permissionsJson: JSON.stringify(keys) } })).then((p) => p.id);
    const hrRole = await profile(['org.settings.manage', 'employee.profile.view', 'employee.change.manage', 'employee.change.retro', 'employee.change.retro_override'], 'HR set-up');
    const payrollRole = await profile(['payroll.setup.manage', 'payroll.component.manage'], 'Payroll set-up');
    const accessRole = await profile(['access.role.manage'], 'Access admin');
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string | null][] = [
      ['hr', 'A', 'panel', hrRole],
      ['admin', 'A', 'org_admin', null],
      ['employee', 'A', 'panel', null],
      ['payroll', 'A', 'panel', payrollRole],
      ['access', 'A', 'panel', accessRole],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [name, k, role, permissionProfileId] of roster) {
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: email(name), passwordHash, role, permissionProfileId } }))).id;
    }
    for (const [name, k] of roster.map((r) => [r[0], r[1]] as const)) {
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: email(name), password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.employee}`).expect(200)).body.accessToken;
  }, 240_000);

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

  it('only people who set up the company see it: an employee, payroll, access admin and someone acting for an employee are refused', async () => {
    for (const who of ['employee', 'payroll', 'access', 'acting'] as const) await api(who, 'get', '/help/setup-hub').expect(403);
    await request(server()).get('/api/v1/help/setup-hub').expect(401);
  });

  it('a new company: every area is listed with its checks, nothing done, each check naming its set-up page', async () => {
    const areas = await hub('hr');
    expect(areas.map((a) => a.id)).toEqual(['org', 'people', 'access', 'time', 'payroll']);
    const checks = areas.flatMap((a) => a.checks);
    // The test's own roles count as roles; everything else is open (one System Admin only, so no second one yet).
    expect(checks.filter((c) => c.done).map((c) => c.id)).toEqual(['roles']);
    expect(checks.every((c) => c.href.startsWith('/yx/'))).toBe(true);
    expect(checks.filter((c) => c.blocking).map((c) => c.id)).toEqual(['entities', 'locations', 'structure', 'employees', 'leave-types', 'leave-policies', 'holidays', 'pay-groups', 'components', 'templates']);
  });

  it('what the areas already know turns checks done; the System Admin sees the same', async () => {
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.le = (await tx.legalEntity.create({ data: { ...o, name: 'Entity KF', shortName: 'KF', isDefault: true, employeeCodePrefix: 'KF' } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.le, name: 'Site KF', code: 'KF', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const id = randomUUID();
      await tx.department.create({ data: { ...o, id, name: 'Quality', code: 'Q', path: `/${id}/` } });
      ids.dept = id;
      ids.des = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.type = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'P', category: 'permanent' } })).id;
      await tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'probation.default_months', value: '3' } });
    });
    const hire = async (givenName: string, code: string, manager: string | null) =>
      (
        await api('hr', 'post', '/people/employees')
          .send({ legalEntityId: ids.le, employeeCode: code, givenName, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before go-live', joinedOn: joined, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.des, employmentTypeId: ids.type, managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    const top = await hire('Lakshmi', 'KF0001', null);
    let areas = await hub('hr');
    for (const c of ['entities', 'locations', 'structure', 'org-rules']) expect(done(areas, 'org', c)).toBe(true);
    expect(done(areas, 'people', 'employees')).toBe(true);
    expect(done(areas, 'people', 'managers')).toBe(true); // only the top person has no manager
    await hire('Arjun', 'KF0002', top);
    await hire('Meera', 'KF0003', null); // a second person without a manager is a gap
    areas = await hub('admin');
    expect(done(areas, 'people', 'managers')).toBe(false);
    expect(done(areas, 'people', 'people-rules')).toBe(false);
    expect(done(areas, 'time', 'leave-types')).toBe(false);
    expect(done(areas, 'payroll', 'pay-groups')).toBe(false);
  });

  it('a company sees only its own set-up: another company stays empty', async () => {
    const theirs = await hub('adminB');
    expect(theirs.flatMap((a) => a.checks).filter((c) => c.done)).toEqual([]);
  });

  it('a company hides the areas it does not use (setting), so the hub can reach complete', async () => {
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      for (const key of ['setup.hub.time', 'setup.hub.payroll']) await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value: 'off' } });
    });
    expect((await hub('hr')).map((a) => a.id)).toEqual(['org', 'people', 'access']);
    expect((await hub('adminB')).map((a) => a.id)).toEqual(['org', 'people', 'access', 'time', 'payroll']);
  });
});
