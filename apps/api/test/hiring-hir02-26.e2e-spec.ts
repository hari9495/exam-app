import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { AiApiKeyResolverService, AiNotConfiguredError, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';

// HIR-02 requisitions list and HIR-26 rediscovery panel end to end against the real database (forced RLS, the app
// role). Recruiting and HR see every requisition; a hiring manager sees their own, read-only and without plan budgets
// (founder decision 11); approvals and send-back show on the list; an employee is refused; another company sees
// nothing; raising is refused while acting for someone else; bad input is refused. Rediscovery (founder decision 2) is
// advisory: plain text search with AI off, a fake AI provider (never a real AI) only adds notes with AI on; only this
// company's consented, in-retention candidates the viewer may see are suggested; names never go to the AI.
describe('HIR-02 requisitions and HIR-26 rediscovery', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let billingPlanId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'rec' | 'hra' | 'mgr' | 'mgr2' | 'emp' | 'acting';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = (o: string) => <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => at(org.A.id)(fn);
  const setting = (key: string, value: string | null) =>
    inA(async (tx) => {
      await tx.setting.deleteMany({ where: { organizationId: org.A.id, key } });
      if (value) await tx.setting.create({ data: { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id, key, value } });
    });
  type Row = { id: string; title: string; status: string; positions: number; outsidePlan: boolean; budgetAmount: number | null; hiringManager: string; line: { budget: number | null; approved: number } | null; approval: { status: string; reason: string | null; waitingOn: string | null; myTaskId: string | null; steps: { name: string; state: string }[] } | null };
  const list = async (who: Who) => (await api(who, 'get', '/hiring/requisitions').expect(200)).body as { viewer: string; rows: Row[] };
  type Match = { id: string; name: string; lastRole: string; lastStage: string; reasons: string[]; aiNote: string | null; consent: { email: string; whatsapp: string }; retentionUntil: string; pool: string | null };
  const rediscover = async (who: Who, id: string) => (await api(who, 'get', `/hiring/requisitions/${id}/rediscovery`).expect(200)).body as { mode: string; ai: string; matches: Match[] };
  // The fake AI: whether the company has a provider, what it answers, and every prompt it was sent.
  const fake = { configured: true, prompts: [] as string[], answer: async (): Promise<Record<string, unknown>> => ({ notes: [{ ref: 'P1', note: '<b>Reached the final panel</b> for a QA role and knows Selenium.' }, { ref: 'P9', note: 'unknown ref' }] }) };
  const whoIs = (userId: string) => (Object.keys(users) as Who[]).find((w) => users[w] === userId)!;
  const decide = async (jobId: string, decision: 'approve' | 'reject') => {
    const task = await inA(async (tx) => {
      const job = await tx.job.findFirstOrThrow({ where: { id: jobId } });
      return tx.wfTask.findFirstOrThrow({ where: { requestId: job.wfRequestId!, status: 'open' } });
    });
    await request(server()).post(`/api/v1/workflow/approvals/tasks/${task.id}/decide`).set('Authorization', `Bearer ${token[whoIs(task.assigneeUserId)]}`).send({ decision, ...(decision === 'reject' ? { reason: 'Add the client territory' } : {}) }).expect(200);
    return whoIs(task.assigneeUserId);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(AiApiKeyResolverService)
      .useValue({
        resolve: async () => {
          if (!fake.configured) throw new AiNotConfiguredError('no key');
          return { ping: async () => undefined, generateStructured: async (r: { prompt: string }) => (fake.prompts.push(r.prompt), fake.answer()) };
        },
      })
      .compile();
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

    billingPlanId = (await prisma.plan.create({ data: { name: `hir0226-plan-${run}`, candidateLimit: 100, aiCreditLimit: 100, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR0226 Org ${k}`, slug: `hir0226-${k.toLowerCase()}-${run}`, planId: billingPlanId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['rec', 'A', 'panel', tpl('recruiter')],
      ['hra', 'A', 'panel', tpl('hiring_admin')],
      ['mgr', 'A', 'panel', tpl('hiring_manager')],
      ['mgr2', 'A', 'panel', tpl('hiring_manager')],
      ['emp', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await at(o)((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at(o)((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir0226-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir0226-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      const dept = randomUUID();
      ids.eng = (await tx.department.create({ data: { ...x, id: dept, name: 'Engineering', code: 'ENG', path: `/${dept}/` } })).id;
      ids.qa = (await tx.designation.create({ data: { ...x, name: 'QA Engineer', code: 'QAE' } })).id;
      const plan = await tx.headcountPlan.create({ data: { ...x, departmentId: ids.eng, fyStart: 2026, status: 'approved', createdBy: users.hra } });
      ids.line = (await tx.headcountPlanLine.create({ data: { ...x, planId: plan.id, designationId: ids.qa, count: 3, budget: 3_000_000 } })).id;
      ids.notice = (await tx.consentNotice.create({ data: { ...x, purpose: 'talent_pool', version: 1, text: 'Keep my details for other roles.' } })).id;
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
    await app.close();
  });

  it('managers raise requisitions; recruiting and HR see them all with the route; a manager sees only their own', async () => {
    ids.r1 = (await api('mgr', 'post', '/jobs/requisitions').send({ title: 'QA Engineer', requisitionReason: 'new', headcountPlanLineId: ids.line, outsidePlan: false, headcount: 1, budgetAmount: 900_000 }).expect(201)).body.id;
    ids.r2 = (await api('mgr', 'post', '/jobs/requisitions').send({ title: 'Release Manager', requisitionReason: 'new', headcountPlanLineId: null, outsidePlan: true, outsidePlanReason: 'New client go-live', headcount: 1, budgetAmount: 1_500_000 }).expect(201)).body.id;
    ids.r3 = (await api('mgr2', 'post', '/jobs/requisitions').send({ title: 'Data Analyst', requisitionReason: 'new', outsidePlan: true, outsidePlanReason: 'Reporting backlog', headcount: 2, budgetAmount: 800_000 }).expect(201)).body.id;

    for (const who of ['rec', 'hra'] as const) {
      const seen = await list(who);
      expect(seen.viewer).toBe('all');
      expect(seen.rows.map((r) => r.id).sort()).toEqual([ids.r1, ids.r2, ids.r3].sort());
    }
    const all = (await list('rec')).rows;
    const r1 = all.find((r) => r.id === ids.r1)!;
    expect(r1).toMatchObject({ title: 'QA Engineer', status: 'Pending approval', positions: 1, budgetAmount: 900_000, hiringManager: `mgr ${run}`, line: { approved: 3, budget: 3_000_000 }, approval: { status: 'pending', waitingOn: expect.any(String) } });
    const r2 = all.find((r) => r.id === ids.r2)!;
    expect(r2.outsidePlan).toBe(true);
    // Outside the plan adds its own approval step (the plan setting is advisory by default).
    expect(r2.approval!.steps.map((s) => s.name)).toContain('Outside the plan');

    const mine = await list('mgr');
    expect(mine.viewer).toBe('own');
    expect(mine.rows.map((r) => r.id).sort()).toEqual([ids.r1, ids.r2].sort());
    expect(mine.rows.find((r) => r.id === ids.r1)!.line).toMatchObject({ approved: 3, budget: null });
    expect((await list('mgr2')).rows.map((r) => r.id)).toEqual([ids.r3]);
  });

  it('an approval opens the requisition; a send-back shows the reason; the manager stays read-only', async () => {
    await decide(ids.r1, 'approve');
    expect((await list('mgr')).rows.find((r) => r.id === ids.r1)).toMatchObject({ status: 'Approved' });
    await decide(ids.r2, 'reject');
    const back = (await list('mgr')).rows.find((r) => r.id === ids.r2)!;
    expect(back).toMatchObject({ status: 'Sent back', approval: { status: 'rejected', reason: 'Add the client territory', myTaskId: null } });
    // Read-only: the manager cannot send, withdraw or change requisitions.
    await api('mgr', 'post', `/jobs/${ids.r2}/submit`).expect(403);
    await api('mgr', 'post', `/jobs/${ids.r3}/approval/cancel`).expect(403);
    // Recruiting sends the sent-back one again; it waits again.
    await api('rec', 'post', `/jobs/${ids.r2}/submit`).expect(201);
    expect((await list('rec')).rows.find((r) => r.id === ids.r2)).toMatchObject({ status: 'Pending approval', approval: { status: 'pending', reason: null } });
  });

  it('an employee is refused; another company sees nothing', async () => {
    const refused = (await api('emp', 'get', '/hiring/requisitions').expect(403)).body;
    expect(refused.message).toMatch(/pipeline:manage, ats\.headcount\.manage, ats\.requisition\.raise/);
    await api('emp', 'get', `/hiring/requisitions/${ids.r1}/rediscovery`).expect(403);
    expect((await list('adminB')).rows).toEqual([]);
    await api('adminB', 'get', `/hiring/requisitions/${ids.r1}/rediscovery`).expect(404);
    // A hiring manager never opens someone else's requisition.
    await api('mgr2', 'get', `/hiring/requisitions/${ids.r1}/rediscovery`).expect(404);
  });

  it('rediscovery with AI off: plain text search over consented, in-retention candidates of this company only', async () => {
    // A closed past job in Chennai with candidates who reached it.
    const past = (await api('rec', 'post', '/jobs').send({ title: 'QA Engineer', location: 'Chennai office' }).expect(201)).body.id as string;
    const cand = async (o: 'A' | 'B', name: string, p: { title?: string; skills?: string; consent?: 'given' | 'withdrawn' | null; hold?: boolean; old?: boolean; hired?: boolean } = {}) =>
      at(org[o].id)(async (tx) => {
        const x = { organizationId: org[o].id };
        const notice = o === 'A' ? ids.notice : (await tx.consentNotice.findFirst({ where: x }))?.id ?? (await tx.consentNotice.create({ data: { ...x, purpose: 'talent_pool', version: 1, text: 'Keep me.' } })).id;
        const long = new Date('2023-01-02T00:00:00Z');
        const c = await tx.candidate.create({ data: { ...x, name: `${name} ${run}`, email: `${name.toLowerCase()}-${run}@cand.test`, ...(p.hold ? { legalHoldAt: new Date(), legalHoldReason: 'Court case' } : {}), ...(p.old ? { createdAt: long } : {}), ...(p.hired ? { globalStage: 'hired' } : {}) } });
        await tx.candidateProfile.create({ data: { ...x, candidateId: c.id, parseStatus: 'done', parsedTitle: p.title ?? 'Test Engineer', parsedSkills: p.skills ?? 'Selenium, API testing' } });
        if (p.consent !== null) await tx.candidateConsent.create({ data: { ...x, candidateId: c.id, noticeId: notice, purpose: 'talent_pool', version: 1, source: 'apply', ...(p.old ? { givenAt: long } : {}), ...(p.consent === 'withdrawn' ? { withdrawnAt: new Date() } : {}) } });
        return c.id;
      });
    ids.sana = await cand('A', 'Sana');
    ids.noConsent = await cand('A', 'Noconsent', { consent: null });
    ids.withdrawn = await cand('A', 'Withdrawn', { consent: 'withdrawn' });
    ids.held = await cand('A', 'Held', { hold: true });
    ids.expired = await cand('A', 'Expired', { old: true });
    ids.hired = await cand('A', 'Hired', { hired: true });
    ids.accountant = await cand('A', 'Accountant', { title: 'Accountant', skills: 'Tally, GST' });
    ids.onJob = await cand('A', 'Onjob');
    ids.otherCo = await cand('B', 'Otherco');
    await api('rec', 'post', `/jobs/${past}/entries`).send({ candidateId: ids.sana }).expect(201);
    await api('rec', 'post', `/jobs/${ids.r1}/entries`).send({ candidateId: ids.onJob }).expect(201);
    await inA(async (tx) => {
      const pool = await tx.talentPool.create({ data: { organizationId: org.A.id, name: 'QA silver medallists', kind: 'pool' } });
      await tx.talentPoolMember.create({ data: { organizationId: org.A.id, poolId: pool.id, candidateId: ids.sana } });
    });

    const got = await rediscover('rec', ids.r1);
    expect(got).toMatchObject({ mode: 'text', ai: 'off' });
    expect(got.matches.map((m) => m.id)).toEqual([ids.sana]);
    expect(got.matches[0]).toMatchObject({ name: `Sana ${run}`, lastRole: expect.stringMatching(/^QA Engineer \(JOB-\d{4}\)$/), reasons: ['Past role: Test Engineer'], aiNote: null, consent: { email: 'opted-in', whatsapp: 'none' }, pool: 'QA silver medallists' });
    expect(new Date(got.matches[0].retentionUntil).getTime()).toBeGreaterThan(Date.now());
    // The hiring manager sees the same on their own requisition; HR without a candidate key sees none.
    expect((await rediscover('mgr', ids.r1)).matches.map((m) => m.id)).toEqual([ids.sana]);
    expect((await api('hra', 'get', `/hiring/requisitions/${ids.r1}/rediscovery`).expect(403)).body.message).toMatch(/may see candidates/);
    // A requisition with nothing to match: an empty list, not an error.
    expect((await rediscover('rec', ids.r3)).matches).toEqual([]);
    expect(fake.prompts).toEqual([]);
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'ats.rediscovery.run', entityId: ids.r1 } }));
    expect(audits.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(audits[0].metadataJson ?? '{}')).toMatchObject({ mode: 'text', ai: 'off', matches: 1 });
  });

  it('rediscovery with AI on (fake provider): notes only, same people and order; no names go to the AI; every run audited', async () => {
    await setting('hiring.rediscovery.ai', 'on');
    const got = await rediscover('rec', ids.r1);
    expect(got).toMatchObject({ mode: 'ai', ai: 'on' });
    expect(got.matches.map((m) => m.id)).toEqual([ids.sana]);
    // Plain text, tags stripped; an unknown ref from the AI is ignored.
    expect(got.matches[0].aiNote).toBe('Reached the final panel for a QA role and knows Selenium.');
    expect(fake.prompts).toHaveLength(1);
    expect(fake.prompts[0]).toMatch(/QA Engineer/);
    for (const secret of ['Sana', `sana-${run}@cand.test`, ids.sana, 'Otherco', 'Onjob']) expect(fake.prompts[0]).not.toContain(secret);
    expect(await inA((tx) => tx.aiCreditUsage.count({ where: { organizationId: org.A.id, source: 'rediscovery', sourceId: ids.r1 } }))).toBe(1);
    const last = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'ats.rediscovery.run', entityId: ids.r1 }, orderBy: { createdAt: 'desc' } }));
    expect(JSON.parse(last.metadataJson ?? '{}')).toMatchObject({ mode: 'ai', ai: 'on', matches: 1 });
    expect(String(last.metadataJson)).not.toMatch(/Role:|Selenium/);

    // A failing AI still shows the plain search.
    fake.answer = async () => {
      throw new Error('provider down');
    };
    expect(await rediscover('rec', ids.r1)).toMatchObject({ mode: 'text', ai: 'failed', matches: [{ id: ids.sana, aiNote: null }] });
    // No provider set up: plain search, and the page can say why.
    fake.configured = false;
    expect(await rediscover('rec', ids.r1)).toMatchObject({ mode: 'text', ai: 'not_set_up', matches: [{ id: ids.sana }] });
    fake.configured = true;
    // The company setting off: plain search, the AI is never called.
    await setting('hiring.rediscovery.ai', 'off');
    const n = fake.prompts.length;
    expect(await rediscover('rec', ids.r1)).toMatchObject({ mode: 'text', ai: 'off' });
    expect(fake.prompts).toHaveLength(n);
    await api('adminA', 'put', '/org/settings').send({ key: 'hiring.rediscovery.ai', scopeType: 'tenant', value: 'sometimes' }).expect(400);
  });

  it('acting for someone else: raising is refused, reading works, and no AI runs on their behalf', async () => {
    await setting('hiring.rediscovery.ai', 'on');
    await inA(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id: users.mgr } });
      await tx.roleGrant.create({ data: { organizationId: org.A.id, userId: users.mgr, permissionProfileId: u.permissionProfileId!, scopeType: 'tenant', validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Hiring manager' } });
    });
    token.acting = (await request(server()).post(`/api/v1/auth/impersonate/${users.mgr}`).set('Authorization', `Bearer ${token.adminA}`).expect(200)).body.accessToken;
    expect((await api('acting', 'post', '/jobs/requisitions').send({ title: 'QA Engineer', requisitionReason: 'new', headcountPlanLineId: ids.line, outsidePlan: false, headcount: 1, budgetAmount: 900_000 }).expect(403)).body.message).toMatch(/acting for someone else/);
    expect((await list('acting')).rows.map((r) => r.id).sort()).toEqual([ids.r1, ids.r2].sort());
    const n = fake.prompts.length;
    expect(await rediscover('acting', ids.r1)).toMatchObject({ mode: 'text', ai: 'off', matches: [{ id: ids.sana }] });
    expect(fake.prompts).toHaveLength(n);
    await setting('hiring.rediscovery.ai', null);
  });

  it('bad input is refused', async () => {
    await api('rec', 'get', '/hiring/requisitions/not-a-uuid/rediscovery').expect(400);
    await api('rec', 'get', `/hiring/requisitions/${randomUUID()}/rediscovery`).expect(404);
    const raise = (body: object) => api('mgr', 'post', '/jobs/requisitions').send({ title: 'QA Engineer', requisitionReason: 'new', headcountPlanLineId: ids.line, outsidePlan: false, headcount: 1, budgetAmount: 900_000, ...body });
    await raise({ headcount: 0 }).expect(400);
    await raise({ budgetAmount: -5 }).expect(400);
    await raise({ title: '' }).expect(400);
    await raise({ headcountPlanLineId: 'nope' }).expect(400);
    await raise({ headcountPlanLineId: randomUUID() }).expect(400);
    await raise({ outsidePlan: true, headcountPlanLineId: null, outsidePlanReason: '' }).expect(400);
    await raise({ extra: 1 }).expect(400);
  });
});
