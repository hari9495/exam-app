import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { AiApiKeyResolverService, BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { AiInvocationService } from '../src/ai/ai-invocation.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-23 bias audit record end to end (docs/yukthix/hiring-design-map.md, founder decision 2 and question 7): the NYC
// setting (off by default), the law's rule set (verify), recording an audit (auditor, date, published summary, results,
// PDF report; valid 12 months), and the gate: with the setting on and no valid audit, the rediscovery AI notes and the AI
// draft scorecard are refused for New York City jobs with a plain message, never silently skipped. Another company is
// 404; acting for someone else is 403; bad input is 400.

jest.setTimeout(120_000);

describe('Hiring HIR-23 bias audit', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'admin2' | 'rec' | 'int1' | 'emp' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const setSetting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const daysAgo = (n: number) => new Date(Date.parse(`${istToday}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const PDF = Buffer.from('%PDF-1.4 audit report').toString('base64');
  let law: { sex: string[]; race: string[] };
  const results = (over: Partial<Record<'sex' | 'race', { label: string; assessed: number; selected: number }[]>> = {}) => ({
    sex: law.sex.map((label) => ({ label, assessed: 100, selected: 30 })),
    race: law.race.map((label) => ({ label, assessed: 40, selected: 12 })),
    ...over,
  });
  const audit = (over: Record<string, unknown> = {}) => ({ auditedOn: daysAgo(10), auditor: 'Hudson Fairness Auditors LLC', summaryUrl: 'https://example.com/ai-audit', results: results(), reportBase64: PDF, reportName: 'audit.pdf', ...over });
  const fakeAi = { run: async (_c: unknown, _o: unknown, fn: (p: unknown) => Promise<unknown>) => fn({ generateStructured: async () => ({ notes: [], items: [{ skill: 'Test design', rating: 4, note: 'n', quote: 'q' }] }) }) };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService).useValue(createFakeBlobStorage())
      .overrideProvider(AiInvocationService).useValue(fakeAi)
      .overrideProvider(AiApiKeyResolverService).useValue({ resolve: async () => ({ generateStructured: async () => ({}) }) })
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

    planId = (await prisma.plan.create({ data: { name: `hir23-plan-${run}`, candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR23 Org ${k}`, slug: `hir23-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['admin2', 'A', 'panel', ['ats.settings.manage', 'org.settings.manage']],
      ['rec', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage']],
      ['int1', 'A', 'panel', ['ats.interview.schedule']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir23-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir23-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Acting for someone with the hiring settings key: only the acting rule can refuse.
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.admin2}`).expect(200)).body.accessToken;

    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Demo Foods Inc', shortName: `DF-${run}`, isDefault: true } })).id;
      ids.nyc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Manhattan office', code: 'NYC', address: { lines: ['1 Main St'], city: 'New York', state: 'US-NY', postalCode: '10001', country: 'US' }, country: 'US', state: 'US-NY', timezone: 'America/New_York' } })).id;
      ids.albany = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Albany office', code: 'ALB', address: { lines: ['2 State St'], city: 'Albany', state: 'US-NY', postalCode: '12207', country: 'US' }, country: 'US', state: 'US-NY', timezone: 'America/New_York' } })).id;
    });
    ids.nycJob = (await api('admin', 'post', '/jobs').send({ title: 'QA Engineer' }).expect(201)).body.id;
    ids.albanyJob = (await api('admin', 'post', '/jobs').send({ title: 'Analyst' }).expect(201)).body.id;
    await inA(async (tx) => {
      await tx.job.update({ where: { id: ids.nycJob }, data: { locationId: ids.nyc, location: 'Manhattan office' } });
      await tx.job.update({ where: { id: ids.albanyJob }, data: { locationId: ids.albany, location: 'Albany office' } });
    });
    // An interview on the NYC job, for the AI draft scorecard gate.
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'QA round', scaleMax: 5, passBar: 3, items: [{ label: 'Test design', weight: 100 }] }).expect(want(201))).body;
    await api('admin', 'put', `/hiring/jobs/${ids.nycJob}/scorecard`).send({ templateId: t.id }).expect(want(200));
    const entry = (await api('admin', 'post', `/jobs/${ids.nycJob}/entries`).send({ newCandidate: { name: 'Ana Ruiz', email: `ana-${run}@x.test` } }).expect(201)).body.id;
    const slot = { startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date().toISOString() };
    ids.iv = (await api('admin', 'post', `/pipeline/entries/${entry}/interviews`).send({ panelistUserIds: [users.int1], location: 'Video call', timeZone: 'America/New_York', slots: [slot] }).expect(want(201))).body.id;
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

  it('defaults: the NYC setting is off, the law is data marked verify, no audits; who may read', async () => {
    const v = (await api('admin', 'get', '/hiring/bias-audits').expect(200)).body;
    expect(v).toMatchObject({ canEdit: true, nycOn: false, valid: false, validUntil: null, audits: [], law: { name: expect.stringMatching(/Local Law 144/), verify: true, validMonths: 12 } });
    law = v.law.categories;
    expect(law.sex).toContain('Female');
    expect((await api('rec', 'get', '/hiring/bias-audits').expect(200)).body.canEdit).toBe(false);
    await api('emp', 'get', '/hiring/bias-audits').expect(403);
    await request(server()).get('/api/v1/hiring/bias-audits').expect(401);
  });

  it('setting off: the AI tools run for NYC jobs (not applicable)', async () => {
    await setSetting('hiring.rediscovery.ai', 'on');
    const r = (await api('admin', 'get', `/hiring/requisitions/${ids.nycJob}/rediscovery`).expect(want(200))).body;
    expect(r).toMatchObject({ ai: 'on', blocked: null });
  });

  it('setting on, no audit: rediscovery AI notes are refused for the NYC job with the reason; other jobs run', async () => {
    await setSetting('hiring.bias_audit.nyc', 'on');
    const r = (await api('admin', 'get', `/hiring/requisitions/${ids.nycJob}/rediscovery`).expect(want(200))).body;
    expect(r).toMatchObject({ mode: 'text', ai: 'blocked', blocked: expect.stringMatching(/^AI notes on past candidates is blocked for New York City jobs\. No bias audit is recorded\./) });
    expect((await api('admin', 'get', `/hiring/requisitions/${ids.albanyJob}/rediscovery`).expect(want(200))).body).toMatchObject({ ai: 'on', blocked: null });
    const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'ats.rediscovery.run', entityId: ids.nycJob }, orderBy: { createdAt: 'desc' } }));
    expect(JSON.parse(a.metadataJson!)).toMatchObject({ mode: 'text', ai: 'blocked' });
  });

  it('setting on, no audit: the AI draft scorecard is refused for the NYC job; the card says why first', async () => {
    await setSetting('hiring.notetaker.enabled', 'on');
    await setSetting('hiring.notetaker.ai_draft', 'on');
    await api('int1', 'put', `/hiring/interviews/${ids.iv}/notetaker/consent`).send({ participant: 'me', consent: 'given' }).expect(want(200));
    await api('int1', 'put', `/hiring/interviews/${ids.iv}/notetaker/consent`).send({ participant: 'candidate', consent: 'given' }).expect(want(200));
    const v = (await api('int1', 'put', `/hiring/interviews/${ids.iv}/notetaker/transcript`).send({ text: 'Candidate: I test payments first.' }).expect(want(200))).body;
    expect(v.aiBlocked).toMatch(/^The AI draft scorecard is blocked for New York City jobs/);
    expect((await api('int1', 'post', `/hiring/interviews/${ids.iv}/notetaker/draft`).expect(409)).body.message).toMatch(/blocked for New York City jobs.*Fill the scorecard yourself\.$/);
    expect(await inA((tx) => tx.interviewScorecardDraft.count({ where: { interviewId: ids.iv } }))).toBe(0);
  });

  it('recording is refused without the settings key (403), while acting (403), and for bad input (400)', async () => {
    await api('rec', 'post', '/hiring/bias-audits').send(audit()).expect(403);
    await api('emp', 'post', '/hiring/bias-audits').send(audit()).expect(403);
    // Acting for someone else is refused (the service's own check is unit tested in bias-audit.spec.ts).
    await api('acting', 'post', '/hiring/bias-audits').send(audit()).expect(403);
    const bad: [Record<string, unknown>, RegExp | null][] = [
      [audit({ summaryUrl: 'http://example.com/a' }), null],
      [audit({ auditedOn: '13-11-2026' }), null],
      [audit({ auditor: 'x' }), null],
      [audit({ extra: 1 }), null],
      [audit({ reportBase64: 'not base64!' }), null],
      [audit({ auditedOn: '2099-01-01' }), /future/],
      [audit({ auditedOn: daysAgo(400) }), /no longer counts/],
      [audit({ results: results({ sex: [{ label: law.sex[0]!, assessed: 5, selected: 6 }, ...law.sex.slice(1).map((label) => ({ label, assessed: 1, selected: 0 }))] }) }), /cannot be more than assessed/],
      [audit({ results: results({ sex: law.sex.slice(1).map((label) => ({ label, assessed: 1, selected: 0 })) }) }), /Enter the numbers for/],
      [audit({ results: results({ race: [...results().race, { label: 'Martian', assessed: 1, selected: 0 }] }) }), /is not a category/],
      [audit({ reportBase64: Buffer.from('MZ an exe').toString('base64') }), /must be a PDF/],
    ];
    for (const [body, msg] of bad) {
      const r = await api('admin', 'post', '/hiring/bias-audits').send(body).expect(400);
      if (msg) expect(String(r.body.message)).toMatch(msg);
    }
    expect(await inA((tx) => tx.biasAudit.count())).toBe(0);
  });

  it('an audit is recorded (audited, append-only), counts for 12 months, and the NYC tools run again', async () => {
    const { id } = (await api('admin', 'post', '/hiring/bias-audits').send(audit()).expect(want(201))).body;
    ids.audit = id;
    const v = (await api('admin', 'get', '/hiring/bias-audits').expect(200)).body;
    const d = new Date(`${daysAgo(10)}T00:00:00Z`);
    const until = `${d.getUTCFullYear() + 1}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    expect(v).toMatchObject({ nycOn: true, valid: true, validUntil: until, audits: [{ id, auditor: 'Hudson Fairness Auditors LLC', auditedOn: daysAgo(10), reportName: 'audit.pdf', recordedBy: `admin ${run}` }] });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.bias_audit.recorded', entityId: id, actorUserId: users.admin } }))).toBe(1);
    await expect(inA((tx) => tx.biasAudit.update({ where: { id }, data: { auditor: 'Someone else' } }))).rejects.toThrow(/append-only/);
    expect((await api('admin', 'get', `/hiring/requisitions/${ids.nycJob}/rediscovery`).expect(want(200))).body).toMatchObject({ ai: 'on', blocked: null });
    expect((await api('int1', 'get', `/hiring/interviews/${ids.iv}/notetaker`).expect(200)).body.aiBlocked).toBeNull();
    await api('int1', 'post', `/hiring/interviews/${ids.iv}/notetaker/draft`).expect(want(201));
  });

  it('an audit over a year old blocks again', async () => {
    // Audits are never edited: replace the recent one with one written 370 days ago (as if a year had passed).
    const old = await inA(async (tx) => {
      const a = await tx.biasAudit.findUniqueOrThrow({ where: { id: ids.audit } });
      await tx.biasAudit.delete({ where: { id: a.id } });
      return tx.biasAudit.create({ data: { organizationId: org.A.id, auditedOn: new Date(`${daysAgo(370)}T00:00:00Z`), auditor: a.auditor, summaryUrl: a.summaryUrl, results: a.results as object, reportPath: a.reportPath, reportName: a.reportName, createdBy: a.createdBy } });
    });
    ids.audit = old.id;
    const r = (await api('admin', 'get', `/hiring/requisitions/${ids.nycJob}/rediscovery`).expect(want(200))).body;
    expect(r.blocked).toMatch(/The last bias audit was on .+, more than a year ago\./);
    expect((await api('admin', 'get', '/hiring/bias-audits').expect(200)).body.valid).toBe(false);
  });

  it('the report: a link for readers; another company 404; another company sees no audit (RLS)', async () => {
    expect((await api('rec', 'get', `/hiring/bias-audits/${ids.audit}/report`).expect(200)).body.url).toBeTruthy();
    await api('adminB', 'get', `/hiring/bias-audits/${ids.audit}/report`).expect(404);
    await api('admin', 'get', '/hiring/bias-audits/not-a-uuid/report').expect(400);
    expect((await api('adminB', 'get', '/hiring/bias-audits').expect(200)).body.audits).toEqual([]);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.biasAudit.count())).toBe(0);
  });
});
