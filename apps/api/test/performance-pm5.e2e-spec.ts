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

// Performance batch PM5 end to end against the real database (forced RLS, the app role): HR turns on feedback from
// colleagues for a cycle; the employee proposes within the maximum, never themselves, their manager or a pair HR
// blocked (and the picker never says why); the manager approves; only approved nominees answer (PF-D1), only the
// peer questions; answers show only as groups of at least 3, smaller ones held back, and never carry an author
// (YX-PERF-05); the employee sees them only after release; revealing an author needs perf.feedback.investigate and a
// reason, is audited and tells the admins; companies apart.

describe('Performance batch PM5', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'lakshmi' | 'ravi' | 'kiran' | 'hr' | 'inv';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Form = { sections: { title: string; questions: { id: string; wholeSection: boolean; answer: string }[] }[] };
  const answers = (f: Form, rating: number) => f.sections.flatMap((s) => s.questions.map((q) => (q.answer === 'text' ? { questionId: q.id, text: 'Kind words' } : { questionId: q.id, rating })));

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

    planId = (await prisma.plan.create({ data: { name: `pm5-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM5 Org ${k}`, slug: `pm5-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['meena', 'A', 'panel', []],
      ['lakshmi', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['kiran', 'A', 'panel', []],
      ['hr', 'A', 'panel', ['perf.concern.seal']],
      ['inv', 'A', 'panel', ['perf.feedback.investigate']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
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
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', userId: users[who], workEmail: `${who}@pm5-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'ops');
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya, 'sales');
    emp.sita = await hire('sita', 'Sita', 'KF-004', emp.priya, 'ops');
    emp.meena = await hire('meena', 'Meena', 'KF-005', emp.priya, 'ops');
    emp.lakshmi = await hire('lakshmi', 'Lakshmi', 'KF-006', emp.priya, 'ops');
    emp.ravi = await hire('ravi', 'Ravi', 'KF-007', emp.priya, 'ops');
    emp.kiran = await hire('kiran', 'Kiran', 'KF-008', emp.head, 'ops');
    emp.hr = await hire('hr', 'Hema', 'KF-009', emp.head, 'ops');
    emp.inv = await hire('inv', 'Indu', 'KF-010', emp.head, 'ops');
    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    ids.template = templates.find((t) => t.kind === 'annual')!.id;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('HR turns on feedback from colleagues for a draft cycle, then launches (PM-5.01)', async () => {
    const sales = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('adminA', 'post', '/cycles').send({ name: `FY ${run}`, kind: 'annual', periodFrom: '2025-04-01', periodTo: '2026-03-31', templateId: ids.template, population: sales, stages: [{ key: 'self', dueOn: shift(today, 7) }, { key: 'manager', dueOn: shift(today, 14) }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false } }).expect(201)).body;
    ids.cycle = c.id;
    await api('priya', 'put', `/cycles/${c.id}/peer-feedback`).send({ minNominees: 2, maxNominees: 4, dueOn: shift(today, 10) }).expect(403);
    await api('adminA', 'put', `/cycles/${c.id}/peer-feedback`).send({ minNominees: 4, maxNominees: 2, dueOn: shift(today, 10) }).expect(400);
    await api('adminA', 'put', `/cycles/${c.id}/peer-feedback`).send({ minNominees: 2, maxNominees: 4, dueOn: shift(today, 10) }).expect(200);
    const cur = (await api('adminA', 'get', `/cycles/${c.id}`).expect(200)).body;
    expect(cur.peerFeedback).toEqual({ minNominees: 2, maxNominees: 4, dueOn: shift(today, 10) });
    expect((await api('adminA', 'post', `/cycles/${c.id}/launch`).send({ version: cur.version }).expect(200)).body.reviews).toBe(1);
    await api('adminA', 'put', `/cycles/${c.id}/peer-feedback`).send({ minNominees: 2, maxNominees: 4, dueOn: shift(today, 10) }).expect(409);
    ids.review = (await api('arjun', 'get', '/reviews?view=mine').expect(200)).body[0].id;
  });

  it('nominations: never oneself, the manager or a blocked pair (never saying why); within the maximum (PM-5.01)', async () => {
    await api('hr', 'post', '/reviewer-blocks').send({ employeeA: emp.arjun, employeeB: emp.ravi, reasonCode: 'confidential_matter' }).expect(201);
    await api('priya', 'get', '/reviewer-blocks').expect(403);
    const opts = (await api('arjun', 'get', `/reviews/${ids.review}/nominee-options?q=`).expect(200)).body as { id: string; name: string }[];
    const ids2 = opts.map((o) => o.id);
    expect(ids2).toEqual(expect.arrayContaining([emp.sita, emp.meena, emp.lakshmi, emp.kiran]));
    expect(ids2).not.toEqual(expect.arrayContaining([emp.arjun]));
    expect(ids2).not.toContain(emp.priya);
    expect(ids2).not.toContain(emp.ravi);
    expect(JSON.stringify(opts)).not.toMatch(/confidential|block/i);
    expect((await api('arjun', 'get', `/reviews/${ids.review}/nominee-options?q=Mee`).expect(200)).body.map((o: { id: string }) => o.id)).toEqual([emp.meena]);
    const blocked = (await api('arjun', 'post', `/reviews/${ids.review}/nominations`).send({ reviewerEmployeeId: emp.ravi, relationship: 'peer' }).expect(400)).body.message;
    expect(blocked).toBe('This person cannot be asked for feedback on this review.');
    await api('arjun', 'post', `/reviews/${ids.review}/nominations`).send({ reviewerEmployeeId: emp.priya, relationship: 'peer' }).expect(400);
    for (const who of [emp.sita, emp.meena, emp.lakshmi, emp.kiran]) await api('arjun', 'post', `/reviews/${ids.review}/nominations`).send({ reviewerEmployeeId: who, relationship: 'peer' }).expect(201);
    await api('arjun', 'post', `/reviews/${ids.review}/nominations`).send({ reviewerEmployeeId: emp.hr, relationship: 'other' }).expect(409);
    const list = (await api('arjun', 'get', `/reviews/${ids.review}/nominations`).expect(200)).body as { nominations: { id: string; reviewerEmployeeId: string; status: string }[]; can: { propose: boolean } };
    expect(list.can.propose).toBe(true);
    const of = (e: string) => list.nominations.find((n) => n.reviewerEmployeeId === e)!.id;
    await api('arjun', 'post', `/nominations/${of(emp.kiran)}/withdraw`).expect(200);
    // The manager approves three; the employee cannot approve their own.
    await api('arjun', 'post', `/nominations/${of(emp.sita)}/approve`).expect(403);
    for (const e of [emp.sita, emp.meena, emp.lakshmi]) await api('priya', 'post', `/nominations/${of(e)}/approve`).expect(200);
    await api('priya', 'post', `/nominations/${of(emp.sita)}/approve`).expect(409);
  });

  it('only approved nominees answer, only the peer questions (PF-D1)', async () => {
    await api('kiran', 'get', `/reviews/${ids.review}/peer-form`).expect(404);
    await api('ravi', 'post', `/reviews/${ids.review}/entries/peer/submit`).send({ answers: [] }).expect(404);
    const tasks = (await api('sita', 'get', '/my-feedback-tasks').expect(200)).body;
    expect(tasks).toEqual([expect.objectContaining({ reviewId: ids.review, employee: expect.stringMatching(/^Arjun/), done: false, open: true })]);
    const form = (await api('sita', 'get', `/reviews/${ids.review}/peer-form`).expect(200)).body as Form & { anonymous: boolean };
    expect(form.anonymous).toBe(true);
    expect(form.sections.map((s) => s.title)).toEqual(['Competencies']);
    expect(JSON.stringify(form)).not.toMatch(/self|manager/i);
    await api('sita', 'post', `/reviews/${ids.review}/entries/peer/submit`).send({ answers: answers(form, 4), comment: 'Calm with dealers.' }).expect(200);
    await api('sita', 'post', `/reviews/${ids.review}/entries/peer/submit`).send({ answers: answers(form, 4) }).expect(409);
    await api('meena', 'post', `/reviews/${ids.review}/entries/peer/submit`).send({ answers: answers(form, 2) }).expect(200);
  });

  it('answers show only as groups of 3 or more, never with an author; the employee sees them after release (YX-PERF-05)', async () => {
    let g = (await api('priya', 'get', `/reviews/${ids.review}/peer-feedback`).expect(200)).body;
    expect(g).toMatchObject({ advisory: true, responses: 2, shown: [], heldBack: 2 });
    const form = (await api('lakshmi', 'get', `/reviews/${ids.review}/peer-form`).expect(200)).body as Form;
    await api('lakshmi', 'post', `/reviews/${ids.review}/entries/peer/submit`).send({ answers: answers(form, 3) }).expect(200);
    g = (await api('priya', 'get', `/reviews/${ids.review}/peer-feedback`).expect(200)).body;
    expect(g.shown).toHaveLength(1);
    expect(g.shown[0]).toMatchObject({ group: 'peer', responses: 3 });
    expect(Object.values(g.shown[0].ratings)[0]).toEqual({ average: 3, low: 2, high: 4, count: 3 });
    expect(g.shown[0].texts).toContain('Calm with dealers.');
    const text = JSON.stringify(g);
    for (const who of ['sita', 'meena', 'lakshmi'] as const) {
      expect(text).not.toContain(users[who]);
      expect(text).not.toContain(emp[who]);
    }
    // The review itself never lists peer entries; the employee sees groups only after release.
    expect(JSON.stringify((await api('priya', 'get', `/reviews/${ids.review}`).expect(200)).body)).not.toContain(users.sita);
    expect((await api('arjun', 'get', `/reviews/${ids.review}/peer-feedback`).expect(200)).body).toMatchObject({ released: false, shown: [] });
    await inA((tx) => tx.review.update({ where: { id: ids.review }, data: { status: 'released', releasedAt: new Date() } }));
    expect((await api('arjun', 'get', `/reviews/${ids.review}/peer-feedback`).expect(200)).body.shown).toHaveLength(1);
    await api('kiran', 'get', `/reviews/${ids.review}/peer-feedback`).expect(404);
  });

  it('revealing an author needs perf.feedback.investigate and a reason; audited; admins told (§10.3)', async () => {
    await api('priya', 'get', `/reviews/${ids.review}/peer-entries`).expect(403);
    const entries = (await api('inv', 'get', `/reviews/${ids.review}/peer-entries`).expect(200)).body as { id: string; comment: string | null }[];
    expect(entries).toHaveLength(3);
    expect(JSON.stringify(entries)).not.toContain(users.sita);
    const target = entries.find((x) => x.comment === 'Calm with dealers.')!;
    await api('priya', 'post', `/review-entries/${target.id}/reveal-author`).send({ reason: 'Threat in the comment' }).expect(403);
    await api('inv', 'post', `/review-entries/${target.id}/reveal-author`).send({ reason: 'x' }).expect(400);
    expect((await api('inv', 'post', `/review-entries/${target.id}/reveal-author`).send({ reason: 'Reported as a threat' }).expect(200)).body.author).toMatch(/^Sita/);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'perf.review_entry.author_revealed', entityId: target.id } }))).toBe(1);
    await new Promise((r) => setTimeout(r, 300));
    expect(await inA((tx) => tx.userNotification.count({ where: { type: 'perf.feedback.author_revealed', recipientUserId: users.adminA } }))).toBe(1);
  });

  it('HR ends a block; companies stay apart', async () => {
    const blocks = (await api('hr', 'get', '/reviewer-blocks').expect(200)).body as { id: string }[];
    await api('hr', 'delete', `/reviewer-blocks/${blocks[0].id}`).expect(200);
    expect((await api('hr', 'get', '/reviewer-blocks').expect(200)).body).toEqual([]);
    await api('adminB', 'get', `/reviews/${ids.review}/nominations`).expect(404);
    await api('adminB', 'get', `/reviews/${ids.review}/peer-feedback`).expect(404);
  });
});
