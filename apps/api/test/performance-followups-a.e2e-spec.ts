import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type Redis from 'ioredis';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// Founder answers 3 Nov 2026, followups (performance builder 1), end to end against the real database (forced RLS):
// (3) a disagreement needs 20+ characters on both routes; (4) the home links my earlier reviews (the old list is gone);
// (8) the "Performance set-up" template reads the goal map, and the data migration brings following roles up to it,
// additive and audited, safe to run again; (13) the manager proposes 9-box potential in the manager review, the
// employee never sees it, only the manager may send it, and calibration starts from it. Another company sees nothing.

describe('Performance followups A (founder answers 3 Nov 2026)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'meena' | 'fac' | 'setup';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Review = { id: string; template: { sections: { title: string; questions: { id: string; answer: string; wholeSection: boolean }[] }[] }; proposedPotential: number | null; can: Record<string, boolean>; disagreements: { text: string }[] };
  const answers = (r: Review, rating: number) => r.template.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Notes' } : { questionId: q.id, rating })));
  const setupKeys = ROLE_TEMPLATES.find((t) => t.key === 'performance_setup')!.permissions;

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

    planId = (await prisma.plan.create({ data: { name: `pfa-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PFA Org ${k}`, slug: `pfa-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['meena', 'A', 'panel', []],
      ['fac', 'A', 'panel', ['perf.calibration.facilitate']],
      ['setup', 'A', 'panel', [...setupKeys]],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pfa-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pfa-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      for (const [k, name, code] of [['sales', 'Sales', 'SAL'], ['board', 'Board', 'BRD']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who | null, given: string, code: string, manager: string | null, dept = ids.sales) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', ...(who ? { userId: users[who], workEmail: `${who}@pfa-${run}.test` } : {}), assignment: { locationId: ids.loc, departmentId: dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).then((r) => {
        if (r.status !== 201) throw new Error(`hire ${given}: ${JSON.stringify(r.body)}`);
        return r;
      })).body.id as string;
    emp.chandra = await hire(null, 'Chandra', 'KF-000', null, ids.board);
    emp.head = await hire('head', 'Arun', 'KF-001', emp.chandra);
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head);
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya);
    emp.meena = await hire('meena', 'Meena', 'KF-004', emp.priya);
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const template = ((await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[]).find((t) => t.kind === 'half_yearly')!.id;
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    // A manager-only cycle (no self stage), so the manager can submit at once.
    const c = (await api('adminA', 'post', '/cycles').send({ name: `H1 ${run}`, kind: 'half_yearly', periodFrom: '2025-04-01', periodTo: '2025-09-30', templateId: template, population: sales, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 0, rateLeavers: false } }).expect(201)).body;
    ids.cycle = c.id;
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    ids.arjunReview = (await api('arjun', 'get', '/reviews?view=mine').expect(200)).body[0].id;
    ids.meenaReview = (await api('meena', 'get', '/reviews?view=mine').expect(200)).body[0].id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('(13) the manager proposes potential; only the manager, only 1–3; the employee never sees it; audited', async () => {
    const r = (await api('priya', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body as Review;
    expect(r.proposedPotential).toBeNull();
    await api('priya', 'put', `/reviews/${ids.arjunReview}/entries/manager`).send({ answers: [], potential: 4 }).expect(400);
    await api('priya', 'put', `/reviews/${ids.arjunReview}/entries/manager`).send({ answers: [], potential: 'high' }).expect(400);
    await api('arjun', 'put', `/reviews/${ids.arjunReview}/entries/self`).send({ answers: [], potential: 3 }).expect(400);
    await api('meena', 'put', `/reviews/${ids.arjunReview}/entries/manager`).send({ answers: [], potential: 3 }).expect(404);
    await api('adminB', 'put', `/reviews/${ids.arjunReview}/entries/manager`).send({ answers: [], potential: 3 }).expect(404);
    let m = (await api('priya', 'put', `/reviews/${ids.arjunReview}/entries/manager`).send({ answers: [], potential: 2 }).expect(200)).body as Review;
    expect(m.proposedPotential).toBe(2);
    m = (await api('priya', 'post', `/reviews/${ids.arjunReview}/entries/manager/submit`).send({ answers: answers(m, 4), potential: 3 }).expect(200)).body as Review;
    expect(m.proposedPotential).toBe(3);
    const own = (await api('arjun', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body as Review;
    expect(own.proposedPotential).toBeNull();
    expect((await api('head', 'get', `/reviews/${ids.arjunReview}`).expect(200)).body.proposedPotential).toBe(3);
    const audit = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'perf.review.potential_proposed', entityId: ids.arjunReview }, orderBy: { createdAt: 'asc' } }));
    expect(audit.map((a) => JSON.parse(a.metadataJson!))).toEqual([expect.objectContaining({ before: null, after: 2 }), expect.objectContaining({ before: 2, after: 3 })]);
    // Meena's review: no proposal.
    const mr = (await api('priya', 'get', `/reviews/${ids.meenaReview}`).expect(200)).body as Review;
    await api('priya', 'post', `/reviews/${ids.meenaReview}/entries/manager/submit`).send({ answers: answers(mr, 3) }).expect(200);
  });

  it('(13) calibration starts from the proposal; the facilitator’s own value wins', async () => {
    const scale = (await api('adminA', 'get', '/scales').expect(200)).body[0] as { bands: { label: string }[] };
    const share = Math.floor(100 / scale.bands.length);
    const guide = { bands: scale.bands.map((b, i) => ({ label: b.label, share: i === scale.bands.length - 1 ? 100 - share * (scale.bands.length - 1) : share })), tolerance: 5 };
    const s = (await api('adminA', 'post', `/cycles/${ids.cycle}/calibrations`).send({ name: 'Sales', facilitatorUserId: users.fac, departmentIds: [ids.sales], guide }).expect(201)).body;
    ids.session = s.id;
    let b = (await api('fac', 'get', `/calibrations/${s.id}`).expect(200)).body as { rows: { reviewId: string; potential: number | null; proposedPotential: number | null }[] };
    expect(b.rows.find((x) => x.reviewId === ids.arjunReview)).toMatchObject({ potential: 3, proposedPotential: 3 });
    expect(b.rows.find((x) => x.reviewId === ids.meenaReview)).toMatchObject({ potential: null, proposedPotential: null });
    await api('fac', 'post', `/calibrations/${s.id}/potential`).send({ reviewId: ids.arjunReview, potential: 2, reason: 'Needs a bigger stretch first' }).expect(200);
    b = (await api('fac', 'get', `/calibrations/${s.id}`).expect(200)).body;
    expect(b.rows.find((x) => x.reviewId === ids.arjunReview)).toMatchObject({ potential: 2, proposedPotential: 3 });
  });

  it('(3) a disagreement needs 20+ characters on both routes', async () => {
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(409); // still in calibration
    await api('fac', 'post', `/calibrations/${ids.session}/sign-off`).expect(200);
    await api('adminA', 'post', `/cycles/${ids.cycle}/release`).expect(200);
    const nineteen = 'Not what we agreed.'; // 19 characters
    expect(nineteen).toHaveLength(19);
    expect((await api('arjun', 'post', `/reviews/${ids.arjunReview}/disagree`).send({ text: nineteen }).expect(400)).body.message).toEqual(expect.arrayContaining([expect.stringMatching(/at least 20 characters/)]));
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/disagree`).send({ text: `   ${nineteen}   ` }).expect(400);
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/acknowledge`).send({ disagreement: nineteen }).expect(400);
    const ok = (await api('arjun', 'post', `/reviews/${ids.arjunReview}/disagree`).send({ text: `${nineteen}!` }).expect(200)).body as Review;
    expect(ok.disagreements).toEqual([expect.objectContaining({ text: 'Not what we agreed.!' })]);
    await api('arjun', 'post', `/reviews/${ids.arjunReview}/disagree`).send({ text: 'Once more, still not what we agreed.' }).expect(409);
    await api('meena', 'post', `/reviews/${ids.arjunReview}/disagree`).send({ text: 'Someone else trying to disagree here.' }).expect(404);
  });

  it('(4) the home links my earlier reviews, now the reviews list is gone', async () => {
    // A second cycle makes the first one "earlier".
    const template = ((await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[]).find((t) => t.kind === 'probation')!.id;
    const c = (await api('adminA', 'post', '/cycles').send({ name: `Probation ${run}`, kind: 'probation', periodFrom: '2025-10-01', periodTo: '2026-03-31', templateId: template, population: { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] }, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 0, rateLeavers: false } }).expect(201)).body;
    await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: c.version }).expect(200);
    const h = (await api('arjun', 'get', '/home').expect(200)).body as { myReview: { id: string }; earlierReviews: { id: string; cycle: string }[] };
    const all = [h.myReview.id, ...h.earlierReviews.map((x) => x.id)];
    expect(all).toContain(ids.arjunReview);
    expect(h.earlierReviews.every((x) => x.id !== h.myReview.id)).toBe(true);
    expect((await api('adminB', 'get', '/home').expect(200)).body.earlierReviews).toEqual([]);
  });

  it('(8) the Performance set-up role opens the goal map; the data migration is additive, audited and safe to run again', async () => {
    expect(setupKeys).toContain('perf.goal.view');
    const period = (await api('adminA', 'post', '/goal-periods').send({ name: `FY ${run}`, fromOn: shift(today, -30), toOn: shift(today, 150) }).expect(201)).body.id;
    await api('setup', 'get', `/goal-map?period=${period}`).expect(200);
    await api('priya', 'get', `/goal-map?period=${period}`).expect(403);
    // Three roles before the change: one still following the old template, one edited (no longer following), one made by hand.
    const old = ['perf.calibration.facilitate', 'perf.cycle.manage', 'perf.goal.manage', 'perf.setup.manage'];
    const made = await inA(async (tx) => ({
      following: (await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `follow-${run}`, permissionsJson: JSON.stringify(old), templateKey: 'performance_setup', templateSet: JSON.stringify(old), templateChecked: true } })).id,
      edited: (await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `edited-${run}`, permissionsJson: JSON.stringify([...old, 'perf.review.view']), templateKey: 'performance_setup', templateSet: JSON.stringify(old), templateChecked: true } })).id,
      own: (await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `own-${run}`, permissionsJson: JSON.stringify(['perf.goal.manage']), templateChecked: true } })).id,
    }));
    const sql = readFileSync(join(__dirname, '../prisma/migrations/20261470000100_performance_setup_goal_view/migration.sql'), 'utf8').replace(/^--.*$/gm, '');
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    const migrate = () => prisma.$transaction(async (tx) => { for (const s of statements) await tx.$executeRawUnsafe(s); });
    await migrate();
    await migrate();
    const after = await inA((tx) => tx.permissionProfile.findMany({ where: { id: { in: Object.values(made) } } }));
    const keys = (id: string) => JSON.parse(after.find((p) => p.id === id)!.permissionsJson) as string[];
    expect(keys(made.following)).toEqual([...old, 'perf.goal.view'].sort());
    expect(JSON.parse(after.find((p) => p.id === made.following)!.templateSet!)).toEqual([...old, 'perf.goal.view'].sort());
    expect(keys(made.edited)).not.toContain('perf.goal.view');
    expect(keys(made.own)).toEqual(['perf.goal.manage']);
    const audit = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'access.role.template_synced', entityId: made.following } }));
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].metadataJson!)).toMatchObject({ template: 'performance_setup', added: ['perf.goal.view'] });
  });
});
