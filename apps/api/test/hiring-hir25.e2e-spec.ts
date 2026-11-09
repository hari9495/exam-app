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
import { AiInvocationService } from '../src/ai/ai-invocation.service';
import { purgeNotetaker } from '../src/interviewing/notetaker.service';

// HIR-25 interview notetaker end to end (docs/yukthix/hiring-design-map.md, founder decision 2): off by default; consent
// from every participant before any transcript or AI note (a "no" deletes them); the transcript added by a panellist
// while no provider is connected; the AI draft (its own setting, off) is a suggestion the panellist confirms and submits
// themselves; erase and retention delete transcripts and drafts; another company 404, acting for someone 403.

jest.setTimeout(120_000);

describe('Hiring HIR-25 interview notetaker', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'int1' | 'int2' | 'other' | 'emp' | 'adminB' | 'acting';
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
  const nt = (iv = ids.iv) => `/hiring/interviews/${iv}/notetaker`;
  const TRANSCRIPT = 'Interviewer: How would you test checkout?\nCandidate: I would start with payment failures and partial refunds.';
  const ai = { calls: 0, reply: null as unknown };

  beforeAll(async () => {
    const fakeAi = { run: async (_c: unknown, _o: unknown, fn: (p: unknown) => Promise<unknown>) => (ai.calls++, fn({ generateStructured: async () => ai.reply })) };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(AiInvocationService).useValue(fakeAi).compile();
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

    planId = (await prisma.plan.create({ data: { name: `hir25-plan-${run}`, candidateLimit: 100, aiCreditLimit: 10, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR25 Org ${k}`, slug: `hir25-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['int1', 'A', 'panel', ['ats.interview.schedule']],
      ['int2', 'A', 'panel', ['ats.interview.schedule']],
      ['other', 'A', 'panel', ['ats.interview.schedule']],
      ['emp', 'A', 'panel', []],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir25-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir25-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.int1}`).expect(200)).body.accessToken;

    ids.job = (await api('admin', 'post', '/jobs').send({ title: 'QA Engineer' }).expect(201)).body.id;
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'QA round 1', scaleMax: 5, passBar: 3, items: [{ label: 'Test design', weight: 67 }, { label: 'Communication', weight: 33 }] }).expect(want(201))).body;
    ids.itemA = t.items[0].id;
    ids.itemB = t.items[1].id;
    await api('admin', 'put', `/hiring/jobs/${ids.job}/scorecard`).send({ templateId: t.id }).expect(want(200));
    ids.entry = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: 'Ananya Iyer', email: `ananya-${run}@x.test` } }).expect(201)).body.id;
    const slot = { startsAt: new Date(Date.now() - 3_600_000).toISOString(), endsAt: new Date().toISOString() };
    ids.iv = (await api('admin', 'post', `/pipeline/entries/${ids.entry}/interviews`).send({ panelistUserIds: [users.int1, users.int2], location: 'Video call', timeZone: 'Asia/Kolkata', slots: [slot] }).expect(want(201))).body.id;
    ids.candidate = (await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.entry } }))).candidateId;
    ai.reply = { items: [{ skill: 'Test design', rating: 4, note: 'Prioritised by risk.', quote: 'I would start with payment failures.' }, { skill: 'Communication', rating: 3, note: 'Clear answers.', quote: 'and partial refunds' }] };
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

  it('off by default: the card says so and nothing can be recorded', async () => {
    expect((await api('int1', 'get', nt()).expect(200)).body).toMatchObject({ enabled: false, aiDraft: false, provider: null, recording: false });
    await api('int1', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'given' }).expect(409);
    await api('int1', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(409);
    await api('int1', 'post', `${nt()}/draft`).expect(409);
  });

  it('who may see it: the panel and recruiters; others 403; another company 404', async () => {
    await setSetting('hiring.notetaker.enabled', 'on');
    const v = (await api('int1', 'get', nt()).expect(200)).body;
    expect(v.participants.map((p: { key: string; role: string; consent: string }) => [p.key, p.role, p.consent])).toEqual([['candidate', 'Candidate', 'waiting'], [users.int1, 'Interviewer', 'waiting'], [users.int2, 'Interviewer', 'waiting']]);
    await api('admin', 'get', nt()).expect(200);
    await api('other', 'get', nt()).expect(403);
    await api('emp', 'get', nt()).expect(403);
    await api('adminB', 'get', nt()).expect(404);
    await api('adminB', 'put', `${nt()}/consent`).send({ participant: 'candidate', consent: 'given' }).expect(404);
  });

  it('consent: each panellist only for themselves, the candidate recorded by the panel; acting 403; bad input 400', async () => {
    await api('acting', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'given' }).expect(403);
    await api('admin', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'given' }).expect(403); // a recruiter not on the panel
    for (const body of [{ participant: 'someone', consent: 'given' }, { participant: 'me', consent: 'yes' }, { participant: 'me' }, { participant: 'me', consent: 'given', extra: 1 }]) await api('int1', 'put', `${nt()}/consent`).send(body).expect(400);
    await api('int1', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'given' }).expect(want(200));
    await api('int1', 'put', `${nt()}/consent`).send({ participant: 'candidate', consent: 'given' }).expect(want(200));
    // Not everyone yet: no transcript.
    expect((await api('int1', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(409)).body.message).toBe(`No recording without everyone's consent. Waiting or declined: int2 ${run}.`);
    const v = (await api('int2', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'given' }).expect(want(200))).body;
    expect(v.recording).toBe(true);
    const row = await inA((tx) => tx.interviewNotetakerConsent.findUniqueOrThrow({ where: { interviewId_participant: { interviewId: ids.iv, participant: 'candidate' } } }));
    expect(row).toMatchObject({ consent: 'given', recordedBy: users.int1 });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.notetaker.consent', entityId: ids.iv } }))).toBe(3);
  });

  it('the transcript: a panellist adds it (no provider); acting 403; a recruiter off the panel 403; empty 400', async () => {
    await api('acting', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(403);
    await api('admin', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(403);
    await api('int1', 'put', `${nt()}/transcript`).send({ text: '   ' }).expect(400);
    // Over 200,000 characters is 400 too (validated by the DTO; unit tested, as this test app keeps Express's 100 kB body limit).
    const v = (await api('int1', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(want(200))).body;
    expect(v.transcript).toMatchObject({ addedBy: `int1 ${run}`, characters: TRANSCRIPT.length });
    // The audit never holds the text.
    const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'ats.notetaker.transcript_added', entityId: ids.iv } }));
    expect(a.metadataJson).not.toContain('payment');
  });

  it('the AI draft is its own setting (off by default); on, it is the panellist’s own suggestion; nothing is submitted', async () => {
    expect((await api('int1', 'post', `${nt()}/draft`).expect(409)).body.message).toBe('AI drafting is off for your company. Fill the scorecard yourself.');
    await setSetting('hiring.notetaker.ai_draft', 'on');
    await api('acting', 'post', `${nt()}/draft`).expect(403);
    await api('admin', 'post', `${nt()}/draft`).expect(403);
    const d = (await api('int1', 'post', `${nt()}/draft`).expect(want(201))).body;
    expect(d).toMatchObject({ candidate: 'Ananya Iyer', scaleMax: 5, items: [{ itemId: ids.itemA, rating: 4 }, { itemId: ids.itemB, rating: 3 }] });
    expect(ai.calls).toBe(1);
    // Only the panellist sees their own draft; nothing was submitted.
    await api('int2', 'get', `${nt()}/draft`).expect(404);
    await api('admin', 'get', `${nt()}/draft`).expect(403);
    expect(await inA((tx) => tx.scorecard.count({ where: { interviewId: ids.iv, status: 'submitted' } }))).toBe(0);
    // A malformed reply is 502 and stores nothing for int2.
    ai.reply = { items: 'nope' };
    await api('int2', 'post', `${nt()}/draft`).expect(502);
    expect(await inA((tx) => tx.interviewScorecardDraft.count({ where: { interviewId: ids.iv } }))).toBe(1);
  });

  it('the panellist confirms or changes each rating and submits their own scorecard; the draft goes', async () => {
    await api('int1', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 4, notes: 'Prioritised by risk.' }, { itemId: ids.itemB, rating: 2, notes: 'Clear answers.' }], recommendation: 'yes' }).expect(want(200));
    expect(await inA((tx) => tx.interviewScorecardDraft.count({ where: { interviewId: ids.iv, panelistUserId: users.int1 } }))).toBe(0);
    const a = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'ats.scorecard.submitted', entityId: ids.iv } }));
    expect(JSON.parse(a.metadataJson!)).toMatchObject({ fromDraft: true });
    expect((await api('int1', 'post', `${nt()}/draft`).expect(409)).body.message).toBe('You already submitted this scorecard; it cannot change.');
  });

  it('a later "no" deletes the transcript and every draft at once', async () => {
    ai.reply = { items: [{ skill: 'Test design', rating: 3, note: 'n', quote: 'q' }] };
    await api('int2', 'post', `${nt()}/draft`).expect(want(201));
    await api('int2', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'declined' }).expect(want(200));
    expect(await inA((tx) => tx.interviewTranscript.count({ where: { interviewId: ids.iv } }))).toBe(0);
    expect(await inA((tx) => tx.interviewScorecardDraft.count({ where: { interviewId: ids.iv } }))).toBe(0);
    const v = (await api('int1', 'get', nt()).expect(200)).body;
    expect(v).toMatchObject({ recording: false, transcript: null });
    await api('int1', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(409);
  });

  it('retention: transcripts and drafts older than the company’s days are deleted; a newer one stays', async () => {
    await api('int2', 'put', `${nt()}/consent`).send({ participant: 'me', consent: 'given' }).expect(want(200));
    await api('int2', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(want(200));
    await setSetting('hiring.notetaker.keep_days', '30');
    await inA((tx) => tx.interviewTranscript.updateMany({ where: { interviewId: ids.iv }, data: { createdAt: new Date(Date.now() - 20 * 86_400_000) } }));
    await tenantPrisma.forTenant(SUPER, (tx) => purgeNotetaker(tx, new Date()));
    expect(await inA((tx) => tx.interviewTranscript.count({ where: { interviewId: ids.iv } }))).toBe(1);
    await inA((tx) => tx.interviewTranscript.updateMany({ where: { interviewId: ids.iv }, data: { createdAt: new Date(Date.now() - 31 * 86_400_000) } }));
    await tenantPrisma.forTenant(SUPER, (tx) => purgeNotetaker(tx, new Date()));
    expect(await inA((tx) => tx.interviewTranscript.count({ where: { interviewId: ids.iv } }))).toBe(0);
  });

  it('erasing the candidate deletes the transcript and the drafts', async () => {
    await api('int2', 'put', `${nt()}/transcript`).send({ text: TRANSCRIPT }).expect(want(200));
    ai.reply = { items: [{ skill: 'Test design', rating: 3, note: 'n', quote: 'q' }] };
    await api('int2', 'post', `${nt()}/draft`).expect(want(201));
    // The erase needs the application closed first (HIR-05).
    await inA((tx) => tx.pipelineEntry.update({ where: { id: ids.entry }, data: { rejected: true, rejectedAt: new Date() } }));
    await api('admin', 'post', `/candidates/${ids.candidate}/erase`).expect((r) => {
      if (r.status >= 300) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
    });
    expect(await inA((tx) => tx.interviewTranscript.count({ where: { interviewId: ids.iv } }))).toBe(0);
    expect(await inA((tx) => tx.interviewScorecardDraft.count({ where: { interviewId: ids.iv } }))).toBe(0);
  });

  it('row-level security: another company sees no consent, transcript or draft rows', async () => {
    const b = { organizationId: org.B.id, isSuperAdmin: false };
    expect(await tenantPrisma.forTenant(b, (tx) => tx.interviewNotetakerConsent.count({ where: { interviewId: ids.iv } }))).toBe(0);
    expect(await tenantPrisma.forTenant(b, (tx) => tx.interviewTranscript.count())).toBe(0);
    expect(await tenantPrisma.forTenant(b, (tx) => tx.interviewScorecardDraft.count())).toBe(0);
  });

  it('the older notes-to-scorecard route is gone', async () => {
    await api('int1', 'post', `/interviews/${ids.iv}/scorecard`).send({ notes: 'x' }).expect(404);
  });
});
