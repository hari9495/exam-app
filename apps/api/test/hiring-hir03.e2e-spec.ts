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

// HIR-03 jobs list and workspace, HIR-24 job pay range, end to end against the real database (forced RLS, the app role).
// The pay law comes from the HIR.PAY_TRANSPARENCY rows (India: none; New York: range required, pay history banned; Texas:
// no row). Positive and negative: recruiter and HR create and edit jobs; the company settings decide where no law does;
// the law wins where it applies; minimum above maximum, bad input, an employee, another company and acting for someone
// else are refused.
describe('HIR-03 / HIR-24 jobs and pay range', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'hr' | 'rec' | 'emp' | 'hrB' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setting = (key: string, value: string | null) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      if (value) await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
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

    planId = (await prisma.plan.create({ data: { name: `hir03-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR03 Org ${k}`, slug: `hir03-${k.toLowerCase()}-${run}`, planId, careersEnabled: true } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['hr', 'A', 'org_admin', null],
      ['rec', 'A', 'recruiter', null],
      ['emp', 'A', 'panel', []],
      ['hrB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir03-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir03-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      const loc = (name: string, code: string, country: string, state: string, timezone: string) => tx.location.create({ data: { ...x, legalEntityId: ids.entity, name, code, address: {}, country, state, timezone } });
      ids.chennai = (await loc('Chennai office', 'MAA', 'IN', 'IN-TN', 'Asia/Kolkata')).id;
      ids.ny = (await loc('New York office', 'NYC', 'US', 'US-NY', 'America/New_York')).id;
      ids.tx = (await loc('Austin office', 'AUS', 'US', 'US-TX', 'America/Chicago')).id;
      ids.board = (await tx.jobBoard.create({ data: { ...x, name: `Feed ${run}`, feedToken: `feed-${run}` } })).id;
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('India: a recruiter creates a job; the company setting decides (off by default); the workspace shows the law and the boards', async () => {
    expect((await api('rec', 'get', '/jobs/pay-settings').expect(200)).body).toEqual({ showRange: false, askHistory: false });
    const j = (await api('rec', 'post', '/jobs').send({ title: `Accountant ${run}`, locationId: ids.chennai, salaryMin: 900000, salaryMax: 1200000, salaryCurrency: 'INR' }).expect(201)).body;
    ids.chennaiJob = j.id;
    expect(j).toMatchObject({ showSalary: false, askPayHistory: false, salaryPeriod: 'year', location: 'Chennai office' });
    const got = (await api('rec', 'get', `/jobs/${j.id}`).expect(200)).body;
    expect(got.payLaw).toMatchObject({ rangeRequired: false, historyBanned: false, name: 'India', verify: true, place: 'Chennai office', showByDefault: false, askByDefault: false });
    expect(got.postings).toEqual([expect.objectContaining({ boardId: ids.board, status: 'not posted' })]);
    // HR edits it: the range shown, by the month, and the pay-history question (allowed in India).
    const p = (await api('hr', 'patch', `/jobs/${j.id}`).send({ showSalary: true, salaryPeriod: 'month', salaryMin: 75000, salaryMax: 100000, askPayHistory: true }).expect(200)).body;
    expect(p).toMatchObject({ showSalary: true, salaryPeriod: 'month', askPayHistory: true });
  });

  it('the company settings give new jobs their defaults where no law decides (India, Texas)', async () => {
    await setting('hiring.pay_range.show', 'on');
    await setting('hiring.pay_history.ask', 'on');
    expect((await api('rec', 'get', '/jobs/pay-settings').expect(200)).body).toEqual({ showRange: true, askHistory: true });
    const tx = (await api('rec', 'post', '/jobs').send({ title: `Analyst ${run}`, locationId: ids.tx }).expect(201)).body;
    expect(tx).toMatchObject({ showSalary: true, askPayHistory: true });
    expect((await api('rec', 'get', `/jobs/${tx.id}`).expect(200)).body.payLaw).toMatchObject({ rangeRequired: false, historyBanned: false, name: null });
  });

  it('New York: the range is always shown, the pay-history question is refused, publishing needs both ends', async () => {
    await api('rec', 'post', '/jobs').send({ title: `QA ${run}`, locationId: ids.ny, askPayHistory: true }).expect(400).expect((r) => expect(r.body.message).toMatch(/bans asking applicants/));
    await api('rec', 'post', '/jobs').send({ title: `QA ${run}`, locationId: ids.ny, showSalary: false }).expect(400).expect((r) => expect(r.body.message).toMatch(/cannot be hidden/));
    // The company says ask the pay-history question, but the law wins.
    const j = (await api('rec', 'post', '/jobs').send({ title: `QA ${run}`, locationId: ids.ny }).expect(201)).body;
    ids.nyJob = j.id;
    expect(j).toMatchObject({ showSalary: true, askPayHistory: false });
    expect((await api('rec', 'get', `/jobs/${j.id}`).expect(200)).body.payLaw).toMatchObject({ rangeRequired: true, historyBanned: true, name: 'New York pay transparency law', verify: true });
    const publish = { publicApplyEnabled: true, listOnCareers: true };
    await api('rec', 'patch', `/jobs/${j.id}`).send(publish).expect(400).expect((r) => expect(r.body.message).toMatch(/requires a pay range before the job is published/));
    await api('rec', 'patch', `/jobs/${j.id}`).send({ jobBoardIds: [ids.board] }).expect(400);
    await api('rec', 'patch', `/jobs/${j.id}`).send({ salaryMin: 95000 }).expect(200);
    await api('rec', 'patch', `/jobs/${j.id}`).send(publish).expect(400);
    await api('rec', 'patch', `/jobs/${j.id}`).send({ ...publish, salaryMax: 120000, salaryCurrency: 'USD', jobBoardIds: [ids.board] }).expect(200);
    const careers = (await request(server()).get(`/api/v1/public/careers/${org.A.slug}`).expect(200)).body;
    expect(careers.jobs.find((x: { title: string }) => x.title === `QA ${run}`)).toMatchObject({ salaryMin: 95000, salaryMax: 120000, salaryCurrency: 'USD', salaryPeriod: 'year' });
    expect((await api('rec', 'get', `/jobs/${j.id}`).expect(200)).body.postings).toEqual([expect.objectContaining({ boardId: ids.board, status: 'live' })]);
    // Once published the range cannot be emptied or hidden, nor the question switched on.
    await api('hr', 'patch', `/jobs/${j.id}`).send({ salaryMax: null }).expect(400);
    await api('hr', 'patch', `/jobs/${j.id}`).send({ showSalary: false }).expect(400);
    await api('hr', 'patch', `/jobs/${j.id}`).send({ askPayHistory: true }).expect(400);
    // Other edits are never blocked by the law: closing works.
    await api('hr', 'patch', `/jobs/${j.id}`).send({ status: 'closed' }).expect(200);
  });

  it('moving a job to New York switches the pay-history question off and shows the range', async () => {
    const moved = (await api('hr', 'patch', `/jobs/${ids.chennaiJob}`).send({ locationId: ids.ny }).expect(200)).body;
    expect(moved).toMatchObject({ askPayHistory: false, showSalary: true, location: 'New York office' });
  });

  it('bad input: minimum above maximum, negative pay, a wrong period or currency', async () => {
    await api('rec', 'post', '/jobs').send({ title: `Bad ${run}`, salaryMin: 200, salaryMax: 100 }).expect(400).expect((r) => expect(r.body.message).toMatch(/minimum pay must not be more than the maximum/));
    await api('rec', 'patch', `/jobs/${ids.nyJob}`).send({ salaryMin: 130000 }).expect(400);
    await api('rec', 'post', '/jobs').send({ title: `Bad ${run}`, salaryMin: -1 }).expect(400);
    await api('rec', 'post', '/jobs').send({ title: `Bad ${run}`, salaryPeriod: 'week' }).expect(400);
    await api('rec', 'post', '/jobs').send({ title: `Bad ${run}`, salaryCurrency: 'rupees' }).expect(400);
    await api('rec', 'post', '/jobs').send({ title: '' }).expect(400);
    await api('rec', 'post', '/jobs').send({ title: `Bad ${run}`, locationId: randomUUID() }).expect(400);
  });

  it('an employee is refused; another company gets Not found', async () => {
    await api('emp', 'get', '/jobs').expect(403);
    await api('emp', 'post', '/jobs').send({ title: `Emp ${run}` }).expect(403);
    await api('emp', 'patch', `/jobs/${ids.nyJob}`).send({ salaryMin: 1 }).expect(403);
    await api('hrB', 'get', `/jobs/${ids.nyJob}`).expect(404);
    await api('hrB', 'patch', `/jobs/${ids.nyJob}`).send({ salaryMin: 1 }).expect(404);
    expect((await api('hrB', 'get', '/jobs').expect(200)).body).toEqual([]);
    expect((await api('hrB', 'get', '/jobs/pay-settings').expect(200)).body).toEqual({ showRange: false, askHistory: false });
  });

  it('acting for someone else: reading works, every job write is refused', async () => {
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.rec}`).set('Authorization', `Bearer ${token.hr}`).expect(200)).body.accessToken;
    await api('acting', 'get', `/jobs/${ids.nyJob}`).expect(200);
    await api('acting', 'post', '/jobs').send({ title: `Acting ${run}` }).expect(403).expect((r) => expect(r.body.message).toMatch(/acting for someone else/));
    await api('acting', 'patch', `/jobs/${ids.nyJob}`).send({ salaryMin: 96000 }).expect(403);
    await api('acting', 'delete', `/jobs/${ids.nyJob}`).expect(403);
    await api('acting', 'post', `/jobs/${ids.nyJob}/submit`).expect(403);
    expect((await inA((tx) => tx.job.findUniqueOrThrow({ where: { id: ids.nyJob } }))).salaryMin).toBe(95000);
  });
});
