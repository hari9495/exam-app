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

// HIR-06 interview calendar and HIR-07 scorecard end to end (docs/yukthix/hiring-design-map.md): a recruiter schedules;
// the calendar range shows a recruiter every interview and anyone else only theirs (or their jobs' as hiring manager);
// a scorecard is the interviewer's own draft until submitted, then read-only and audited; the hiring manager reads
// submitted scorecards for their job; a second submit is refused; overdue follows the company setting; an employee gets
// 403, another company 404; writes are refused while acting for someone else; bad input is 400.

jest.setTimeout(180_000);

describe('Hiring HIR-06 / HIR-07 interviews and scorecards', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'admin2' | 'recruiter' | 'int1' | 'int2' | 'hm' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const hours = (h: number) => new Date(Date.now() + h * 3_600_000);
  const range = (fromH: number, toH: number) => `/hiring/interviews?from=${encodeURIComponent(hours(fromH).toISOString())}&to=${encodeURIComponent(hours(toH).toISOString())}`;
  const setting = (value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key: 'hiring.scorecard.overdue_hours', scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });

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

    planId = (await prisma.plan.create({ data: { name: `hir0607-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR0607 Org ${k}`, slug: `hir0607-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['admin2', 'A', 'recruiter', null],
      ['recruiter', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage']],
      ['int1', 'A', 'panel', ['ats.interview.schedule']],
      ['int2', 'A', 'panel', ['ats.interview.schedule']],
      ['hm', 'A', 'panel', ['ats.candidate.view']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir0607-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir0607-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Acting for a recruiter whose role holds every key used here, so only the acting rule can refuse.
    await inA((tx) => tx.orgRolePermission.create({ data: { organizationId: org.A.id, role: 'recruiter', permissionsJson: JSON.stringify(['pipeline:manage', 'interview:view_assigned', 'results:view', 'candidate:manage', 'candidate:view']) } }));
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.admin2}`).expect(200)).body.accessToken;

    ids.job = (await api('admin', 'post', '/jobs').send({ title: 'QA Engineer' }).expect(201)).body.id;
    ids.job2 = (await api('admin', 'post', '/jobs').send({ title: 'Cashier' }).expect(201)).body.id;
    await inA((tx) => tx.job.update({ where: { id: ids.job }, data: { hiringManagerId: users.hm } }));
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'QA round 1', scaleMax: 5, passBar: 3, items: [{ label: 'Test design', weight: 2 }, { label: 'Communication', weight: 1 }] }).expect(want(201))).body;
    ids.template = t.id;
    ids.itemA = t.items[0].id;
    ids.itemB = t.items[1].id;
    await api('recruiter', 'put', `/hiring/jobs/${ids.job}/scorecard`).send({ templateId: ids.template }).expect(want(200));
    await api('recruiter', 'put', `/hiring/jobs/${ids.job2}/scorecard`).send({ templateId: ids.template }).expect(want(200));
    ids.entry = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: 'Ananya Iyer', email: `ananya-${run}@x.test` } }).expect(201)).body.id;
    ids.entry2 = (await api('admin', 'post', `/jobs/${ids.job2}/entries`).send({ newCandidate: { name: 'Vikram Reddy', email: `vikram-${run}@x.test` } }).expect(201)).body.id;
  });

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users) as string[];
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a recruiter schedules interviews; acting for someone else is refused; bad input is 400', async () => {
    const body = (panel: string[], startH: number) => ({ panelistUserIds: panel, location: 'Video call', timeZone: 'Asia/Kolkata', slots: [{ startsAt: hours(startH).toISOString(), endsAt: hours(startH + 1).toISOString() }] });
    await api('acting', 'post', `/pipeline/entries/${ids.entry}/interviews`).send(body([users.int1!], 24)).expect(403);
    await api('recruiter', 'post', `/pipeline/entries/not-a-uuid/interviews`).send(body([users.int1!], 24)).expect(400);
    await api('recruiter', 'post', `/pipeline/entries/${ids.entry}/interviews`).send({ ...body([users.int1!], 24), panelistUserIds: ['nope'] }).expect(400);
    await api('hm', 'post', `/pipeline/entries/${ids.entry}/interviews`).send(body([users.int1!], 24)).expect(403);
    ids.iv1 = (await api('recruiter', 'post', `/pipeline/entries/${ids.entry}/interviews`).send(body([users.int1!, users.admin2!], -31)).expect(want(201))).body.id;
    ids.iv2 = (await api('recruiter', 'post', `/pipeline/entries/${ids.entry2}/interviews`).send(body([users.int2!], 24)).expect(want(201))).body.id;
    // The first one happened 30 hours ago: confirm its slot (the candidate's answer).
    await inA(async (tx) => {
      const slot = await tx.interviewSlot.findFirstOrThrow({ where: { interviewId: ids.iv1 } });
      await tx.interview.update({ where: { id: ids.iv1 }, data: { status: 'confirmed', confirmedSlotId: slot.id } });
    });
    await api('acting', 'post', `/interviews/${ids.iv2}/send`).expect(403);
    await api('acting', 'post', `/interviews/${ids.iv2}/cancel`).expect(403);
  });

  it('the calendar: a recruiter sees every interview, an interviewer only theirs, a hiring manager their job’s', async () => {
    const all = (await api('recruiter', 'get', range(-72, 72)).expect(want(200))).body as { id: string; candidateName: string; mine: boolean }[];
    expect(all.map((r) => r.id).sort()).toEqual([ids.iv1, ids.iv2].sort());
    expect(all.find((r) => r.id === ids.iv1)).toMatchObject({ candidateName: 'Ananya Iyer', jobTitle: 'QA Engineer', confirmed: true, mine: false });
    expect((await api('int2', 'get', range(-72, 72)).expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.iv2]);
    expect((await api('int1', 'get', range(-72, 72)).expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.iv1]);
    expect((await api('hm', 'get', range(-72, 72)).expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.iv1]);
    // Only what falls in the range.
    expect((await api('recruiter', 'get', range(0, 72)).expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.iv2]);
    // mine: only the interviewer's own.
    expect((await api('int2', 'get', '/hiring/interviews/mine').expect(200)).body.map((r: { id: string }) => r.id)).toEqual([ids.iv2]);
  });

  it('the calendar refuses bad ranges (400), an employee (403) and shows another company nothing', async () => {
    await api('recruiter', 'get', '/hiring/interviews').expect(400);
    await api('recruiter', 'get', '/hiring/interviews?from=yesterday&to=today').expect(400);
    await api('recruiter', 'get', range(10, 0)).expect(400);
    await api('recruiter', 'get', range(0, 24 * 70)).expect(400);
    await api('emp', 'get', range(-72, 72)).expect(403);
    await api('emp', 'get', '/hiring/interviews/mine').expect(403);
    expect((await api('adminB', 'get', range(-72, 72)).expect(200)).body).toEqual([]);
  });

  it('overdue follows the company setting (default 24 hours after the interview)', async () => {
    const row = () => api('int1', 'get', '/hiring/interviews/mine').expect(200).then((r) => r.body.find((x: { id: string }) => x.id === ids.iv1));
    expect(await row()).toMatchObject({ scorecard: 'not_started', overdue: true });
    await setting('72');
    expect(await row()).toMatchObject({ overdue: false });
    await setting('24');
  });

  it('a draft is the interviewer’s own: nobody else sees it, not even the recruiter or hiring manager', async () => {
    await api('int1', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 4, notes: 'Named the edge cases' }], summary: 'draft' }).expect(want(200));
    const own = (await api('int1', 'get', `/hiring/interviews/${ids.iv1}`).expect(200)).body;
    expect(own.scorecards).toHaveLength(1);
    expect(own.scorecards[0]).toMatchObject({ mine: true, status: 'draft' });
    expect((await api('recruiter', 'get', `/hiring/interviews/${ids.iv1}`).expect(200)).body.scorecards).toEqual([]);
    expect((await api('hm', 'get', `/hiring/interviews/${ids.iv1}`).expect(200)).body.scorecards).toEqual([]);
    expect((await api('int1', 'get', '/hiring/interviews/mine').expect(200)).body.find((x: { id: string }) => x.id === ids.iv1).scorecard).toBe('draft');
  });

  it('bad scorecard input is 400; another panel’s interview is 403; acting for someone else is 403', async () => {
    await api('int1', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 9 }] }).expect(400);
    await api('int1', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [{ itemId: randomUUID(), rating: 2 }] }).expect(400);
    await api('int1', 'post', `/hiring/interviews/${ids.iv1}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 4 }], recommendation: 'yes' }).expect(400);
    await api('int1', 'put', `/hiring/interviews/not-a-uuid/scorecard`).send({ ratings: [] }).expect(400);
    await api('int2', 'get', `/hiring/interviews/${ids.iv1}`).expect(403);
    await api('int2', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 2 }] }).expect(403);
    await api('acting', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 2 }] }).expect(403);
    await api('acting', 'post', `/hiring/interviews/${ids.iv1}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 2 }, { itemId: ids.itemB, rating: 2 }], recommendation: 'no' }).expect(403);
    expect(await inA((tx) => tx.scorecard.count({ where: { interviewId: ids.iv1, panelistUserId: users.admin2 } }))).toBe(0);
  });

  it('submitting makes it read-only and audited; a second submit is refused; the hiring manager reads it', async () => {
    const s = (await api('int1', 'post', `/hiring/interviews/${ids.iv1}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 4, notes: 'Named the edge cases' }, { itemId: ids.itemB, rating: 3 }], recommendation: 'yes', summary: 'Solid' }).expect(want(200))).body;
    expect(s).toMatchObject({ status: 'submitted', weightedScore: 3.67, passes: true });
    await api('int1', 'post', `/hiring/interviews/${ids.iv1}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 1 }, { itemId: ids.itemB, rating: 1 }], recommendation: 'no' }).expect(409);
    await api('int1', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [{ itemId: ids.itemB, rating: 1 }] }).expect(409);
    const audit = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'ats.scorecard.submitted', entityId: ids.iv1 } }));
    expect(audit).not.toBeNull();
    const hm = (await api('hm', 'get', `/hiring/interviews/${ids.iv1}`).expect(200)).body;
    expect(hm.viewer).toEqual({ isPanelist: false, isOverseer: true });
    expect(hm.scorecards).toHaveLength(1);
    expect(hm.scorecards[0]).toMatchObject({ panelistName: `int1 ${run}`, status: 'submitted', recommendation: 'yes', weightedScore: 3.67, mine: false });
    expect(hm.result).toMatchObject({ complete: false, submitted: 1, expected: 2 });
    // The hiring manager of another job reads nothing of it.
    await api('hm', 'get', `/hiring/interviews/${ids.iv2}`).expect(403);
    expect((await api('int1', 'get', '/hiring/interviews/mine').expect(200)).body.find((x: { id: string }) => x.id === ids.iv1)).toMatchObject({ scorecard: 'submitted', overdue: false });
  });

  it('the candidate record lists each interview with its job and time', async () => {
    const candidateId = (await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.entry } }))).candidateId;
    const v = (await api('recruiter', 'get', `/hiring/candidates/${candidateId}`).expect(200)).body;
    expect(v.interviews).toEqual([expect.objectContaining({ id: ids.iv1, entryId: ids.entry, jobTitle: 'QA Engineer', status: 'confirmed', when: expect.any(String) })]);
  });

  it('an employee gets 403 and another company 404', async () => {
    await api('emp', 'get', `/hiring/interviews/${ids.iv1}`).expect(403);
    await api('emp', 'put', `/hiring/interviews/${ids.iv1}/scorecard`).send({ ratings: [] }).expect(403);
    await api('adminB', 'get', `/hiring/interviews/${ids.iv1}`).expect(404);
    await api('adminB', 'post', `/hiring/interviews/${ids.iv1}/scorecard/submit`).send({ ratings: [], recommendation: 'yes' }).expect(404);
    await api('adminB', 'post', `/interviews/${ids.iv2}/cancel`).expect(404);
  });

  it('a recruiter cancels an interview; the panel can no longer fill its scorecard', async () => {
    await api('recruiter', 'post', `/interviews/${ids.iv2}/cancel`).expect(want(201));
    await api('int2', 'put', `/hiring/interviews/${ids.iv2}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 3 }] }).expect(409);
    expect((await api('int2', 'get', '/hiring/interviews/mine').expect(200)).body[0]).toMatchObject({ id: ids.iv2, status: 'cancelled' });
  });
});
