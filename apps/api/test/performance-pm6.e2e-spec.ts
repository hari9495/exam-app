import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';

// Performance batch PM6 end to end against the real database (forced RLS, the app role): HR opens a calibration
// session for a cycle's finished reviews; the facilitator moves a 4 to a 3 only with a reason (YX-PERF-08); the move is
// a change row that is never edited; the guide is a soft note that never blocks sign-off (Q5); the employee sees only
// the released 3; managers of the people in it read the board, others do not; reports show people in scope, totals
// equal the reviews, and small cells are suppressed in the CSV; companies apart.

describe('Performance batch PM6', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'lakshmi' | 'ravi' | 'kiran' | 'fac' | 'rep';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const reports: Who[] = ['arjun', 'sita', 'meena', 'lakshmi', 'ravi'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `pm6-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM6 Org ${k}`, slug: `pm6-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ...reports.map((w): [Who, 'A', string, string[]] => [w, 'A', 'panel', []]),
      ['kiran', 'A', 'panel', []],
      ['fac', 'A', 'panel', ['perf.calibration.facilitate']],
      ['rep', 'A', 'panel', ['perf.report.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm6-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm6-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      for (const [k, name, code] of [['sales', 'Sales', 'SAL'], ['ops', 'Operations', 'OPS']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null, dept: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', userId: users[who], workEmail: `${who}@pm6-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'ops');
    let i = 3;
    for (const w of reports) emp[w] = await hire(w, w[0].toUpperCase() + w.slice(1), `KF-00${i++}`, emp.priya, 'sales');
    emp.kiran = await hire('kiran', 'Kiran', 'KF-010', emp.head, 'ops');
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    ids.template = templates.find((t) => t.kind === 'half_yearly')!.id;
    // A manager-only cycle for Sales; Priya rates her five: 4, 4, 4, 3, 2 on both sections.
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send({ name: `H1 ${run}`, kind: 'half_yearly', periodFrom: '2025-04-01', periodTo: '2025-09-30', templateId: ids.template, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false } }).expect(201)).body;
    ids.cycle = c.id;
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    const scores = [4, 4, 4, 3, 2];
    for (const [n, w] of reports.entries()) {
      const rid = (await api(w, 'get', '/reviews?view=mine').expect(200)).body[0].id;
      ids[`r_${w}`] = rid;
      const r = (await api('priya', 'get', `/reviews/${rid}`).expect(200)).body as { template: { sections: { questions: { id: string; answer: string }[] }[] } };
      const answers = r.template.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Notes' } : { questionId: q.id, rating: scores[n] })));
      await api('priya', 'post', `/reviews/${rid}/entries/manager/submit`).send({ answers }).expect(200);
    }
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('HR opens a session with a facilitator who holds the key; the reviews wait there and cannot be released (PM-6.01)', async () => {
    await api('fac', 'post', `/cycles/${ids.cycle}/calibrations`).send({ name: 'Sales', facilitatorUserId: users.fac }).expect(403);
    await api('adminA', 'post', `/cycles/${ids.cycle}/calibrations`).send({ name: 'Sales', facilitatorUserId: users.kiran }).expect(400);
    await api('adminA', 'post', `/cycles/${ids.cycle}/calibrations`).send({ name: 'Sales', facilitatorUserId: users.fac, guide: { bands: [{ label: 'Meets', share: 50 }], tolerance: 10 } }).expect(400);
    const scale = (await api('adminA', 'get', '/scales').expect(200)).body[0] as { bands: { label: string }[] };
    ids.labels = JSON.stringify(scale.bands.map((b) => b.label));
    const share = Math.floor(100 / scale.bands.length);
    const guide = { bands: scale.bands.map((b, i) => ({ label: b.label, share: i === scale.bands.length - 1 ? 100 - share * (scale.bands.length - 1) : share })), tolerance: 5 };
    const s = (await api('adminA', 'post', `/cycles/${ids.cycle}/calibrations`).send({ name: 'Sales', facilitatorUserId: users.fac, departmentIds: [ids.sales], guide }).expect(201)).body;
    expect(s.people).toBe(5);
    ids.session = s.id;
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(409);
    await api('adminA', 'post', `/cycles/${ids.cycle}/calibrations`).send({ name: 'Again', facilitatorUserId: users.fac }).expect(409);
  });

  it('the board: managers of the people in it read it, others do not; no pay; a guide note that never blocks (§11)', async () => {
    const b = (await api('fac', 'get', `/calibrations/${ids.session}`).expect(200)).body;
    expect(b.rows).toHaveLength(5);
    expect(b.can).toEqual({ change: true, signOff: true });
    expect(JSON.stringify(b)).not.toMatch(/ctc|salary|pay/i);
    expect(b.distribution.bands).not.toBeNull();
    expect(b.distribution.notes.length).toBeGreaterThan(0);
    expect((await api('priya', 'get', `/calibrations/${ids.session}`).expect(200)).body.can).toEqual({ change: false, signOff: false });
    await api('kiran', 'get', `/calibrations/${ids.session}`).expect(404);
    await api('arjun', 'get', `/calibrations/${ids.session}`).expect(404);
  });

  it('a 4 moves to a 3 only with a reason; the change is never edited (PM-6.01, YX-PERF-08)', async () => {
    await api('priya', 'post', `/calibrations/${ids.session}/changes`).send({ reviewId: ids.r_arjun, toScore: 3, reason: 'Compared with peers' }).expect(403);
    await api('fac', 'post', `/calibrations/${ids.session}/changes`).send({ reviewId: ids.r_arjun, toScore: 3, reason: '' }).expect(400);
    await api('fac', 'post', `/calibrations/${ids.session}/changes`).send({ reviewId: ids.r_arjun, toScore: 9, reason: 'Too high' }).expect(400);
    const b = (await api('fac', 'post', `/calibrations/${ids.session}/changes`).send({ reviewId: ids.r_arjun, toScore: 3, reason: 'Compared with the plant leads' }).expect(200)).body;
    expect(b.rows.find((r: { reviewId: string }) => r.reviewId === ids.r_arjun)).toMatchObject({ managerScore: 4, score: 3, moved: true });
    expect(b.changes).toEqual([expect.objectContaining({ from: 4, to: 3, reason: 'Compared with the plant leads' })]);
    await expect(inA((tx) => tx.$executeRaw`UPDATE calibration_changes SET reason = 'edited' WHERE review_id = ${ids.r_arjun}::uuid`)).rejects.toThrow(/permission denied/);
  });

  it('sign-off is never blocked by the guide; the employee sees only the released 3 (Q5, YX-PERF-08)', async () => {
    expect((await api('arjun', 'get', `/reviews/${ids.r_arjun}`).expect(200)).body.finalScore).toBeNull();
    expect((await api('fac', 'post', `/calibrations/${ids.session}/sign-off`).expect(200)).body).toEqual({ signedOff: true, people: 5 });
    await api('fac', 'post', `/calibrations/${ids.session}/changes`).send({ reviewId: ids.r_arjun, toScore: 2, reason: 'Late change' }).expect(409);
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(200);
    const own = (await api('arjun', 'get', `/reviews/${ids.r_arjun}`).expect(200)).body;
    expect(own.finalScore).toBe(3);
    expect((await api('arjun', 'get', '/reviews?view=mine').expect(200)).body[0].finalScore).toBe(3);
  });

  it('reports: people in scope only, totals equal the reviews, small cells suppressed in the CSV (PM-6.03)', async () => {
    await api('priya', 'get', `/reports/completion?cycle=${ids.cycle}`).expect(403);
    const comp = (await api('rep', 'get', `/reports/completion?cycle=${ids.cycle}`).expect(200)).body;
    expect(comp.total).toBe(5);
    const dist = (await api('rep', 'get', `/reports/distribution?cycle=${ids.cycle}`).expect(200)).body;
    expect(dist.rows.every((r: unknown[]) => r[2] === null)).toBe(true);
    const csv = await api('rep', 'get', `/reports/distribution/csv?cycle=${ids.cycle}`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toBe('department,band,people');
    expect(csv.text).not.toMatch(/,[1-4]\r\n/);
    const changes = (await api('rep', 'get', `/reports/calibration-changes?cycle=${ids.cycle}`).expect(200)).body;
    expect(changes.rows).toEqual([expect.arrayContaining(['Compared with the plant leads'])]);
    await api('rep', 'get', `/reports/nonsense?cycle=${ids.cycle}`).expect(400);
  });

  it('keeps companies apart', async () => {
    await api('adminB', 'get', `/calibrations/${ids.session}`).expect(404);
    await api('adminB', 'get', `/reports/completion?cycle=${ids.cycle}`).expect(404);
  });
});
