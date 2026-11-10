import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Founder answers 511 and 515 end to end. 511: being on an interview's panel (not a role key) is what lets a plain
// employee see their interviews, open the résumé and fill and submit their scorecard; a plain employee off the panel
// is refused (403), another company 404, acting for someone else 403 on writes. A custom role that still holds the
// interviewer keys (Divya's "Team Manager") keeps working. 515: recruiting reads the job-board names to pick boards,
// never the feed token or the provider credentials; the full board list stays with the settings key.

jest.setTimeout(120_000);

describe('Hiring keys (answers 511, 515)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'rec' | 'plain' | 'plain2' | 'divya' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
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

    planId = (await prisma.plan.create({ data: { name: `hkeys-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HKEYS Org ${k}`, slug: `hkeys-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    // plain / plain2: the default employee after answer 511 (no hiring key at all); divya: a custom role that still holds them.
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['rec', 'A', 'panel', ['ats.job.manage', 'ats.candidate.manage', 'ats.interview.schedule']],
      ['plain', 'A', 'panel', ['org:view', 'payroll.equity.own']],
      ['plain2', 'A', 'panel', ['org:view', 'payroll.equity.own']],
      ['divya', 'A', 'panel', ['ats.requisition.raise', 'interview:view_assigned', 'results:view', 'payroll.equity.own']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hkeys-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hkeys-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.plain}`).expect(200)).body.accessToken;

    ids.job = (await api('admin', 'post', '/jobs').send({ title: 'QA Engineer' }).expect(201)).body.id;
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'QA round', scaleMax: 5, passBar: 3, items: [{ label: 'Test design', weight: 100 }] }).expect(want(201))).body;
    ids.item = t.items[0].id;
    await api('admin', 'put', `/hiring/jobs/${ids.job}/scorecard`).send({ templateId: t.id }).expect(want(200));
    const entry = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: 'Farhan Sheikh', email: `farhan-${run}@x.test` } }).expect(201)).body.id;
    const cand = (await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: entry } }))).candidateId;
    await inA((tx) => tx.candidateProfile.create({ data: { organizationId: org.A.id, candidateId: cand, resumePath: 'candidates/x/resume.pdf', resumeScan: 'clean', parseStatus: 'done' } }));
    const slot = { startsAt: new Date(Date.now() - 3 * 3_600_000).toISOString(), endsAt: new Date(Date.now() - 2 * 3_600_000).toISOString() };
    ids.iv = (await api('admin', 'post', `/pipeline/entries/${entry}/interviews`).send({ panelistUserIds: [users.plain, users.divya], location: 'Video call', timeZone: 'Asia/Kolkata', slots: [slot] }).expect(want(201))).body.id;
    await inA(async (tx) => {
      const s = await tx.interviewSlot.findFirstOrThrow({ where: { interviewId: ids.iv } });
      await tx.interview.update({ where: { id: ids.iv }, data: { status: 'confirmed', confirmedSlotId: s.id } });
    });
    ids.board = (await api('admin', 'post', '/organizations/job-boards').send({ name: `Naukri ${run}` }).expect(201)).body.id;
    await api('adminB', 'post', '/organizations/job-boards').send({ name: `Indeed ${run}` }).expect(201);
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

  it('511: a plain employee on the panel sees their interview, the résumé and the scorecard to fill', async () => {
    const mine = (await api('plain', 'get', '/hiring/interviews/mine').expect(200)).body as { id: string }[];
    expect(mine.map((r) => r.id)).toEqual([ids.iv]);
    const v = (await api('plain', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body;
    expect(v.viewer).toEqual({ isPanelist: true, isOverseer: false });
    expect((await api('plain', 'get', `/hiring/interviews/${ids.iv}/resume`).expect(200)).body.url).toBeTruthy();
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'ats.interview.resume_opened', entityId: ids.iv, actorUserId: users.plain } }))).toBe(1);
    // The Home card lists the scorecard they owe, without any hiring key.
    const home = (await api('plain', 'get', '/workspace/home').expect(200)).body;
    expect(home.hiring?.scorecardsDue?.map((s: { interviewId: string }) => s.interviewId)).toEqual([ids.iv]);
    // Still no key-gated hiring page: the candidate list and the job list are refused.
    await api('plain', 'get', '/candidates').expect(403);
    await api('plain', 'get', `/hiring/jobs/${ids.job}/board`).expect(403);
  });

  it('511: the plain panellist saves and submits their own scorecard; acting for them is 403', async () => {
    await api('acting', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.item, rating: 4 }], recommendation: 'yes' }).expect(403);
    await api('plain', 'put', `/hiring/interviews/${ids.iv}/scorecard`).send({ ratings: [{ itemId: ids.item, rating: 4, notes: 'Clear test plan' }] }).expect(want(200));
    const s = (await api('plain', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.item, rating: 4, notes: 'Clear test plan' }], recommendation: 'yes' }).expect(want(200))).body;
    expect(s).toMatchObject({ status: 'submitted' });
  });

  it('511: a custom role that still holds the interviewer keys (Divya) works as before', async () => {
    await api('divya', 'get', `/hiring/interviews/${ids.iv}`).expect(200);
    await api('divya', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.item, rating: 3 }], recommendation: 'no' }).expect(want(200));
    // After submitting, Divya reads the colleague's submitted scorecard (D7).
    const v = (await api('divya', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body;
    expect(v.scorecards.map((x: { panelistUserId: string }) => x.panelistUserId).sort()).toEqual([users.divya, users.plain].sort());
  });

  it('511: a plain employee off the panel is refused (403); another company is 404; no résumé for them', async () => {
    expect((await api('plain2', 'get', '/hiring/interviews/mine').expect(200)).body).toEqual([]);
    await api('plain2', 'get', `/hiring/interviews/${ids.iv}`).expect(403);
    await api('plain2', 'get', `/hiring/interviews/${ids.iv}/resume`).expect(403);
    await api('plain2', 'put', `/hiring/interviews/${ids.iv}/scorecard`).send({ ratings: [{ itemId: ids.item, rating: 2 }] }).expect(403);
    await api('adminB', 'get', `/hiring/interviews/${ids.iv}`).expect(404);
    await api('adminB', 'get', `/hiring/interviews/${ids.iv}/resume`).expect(404);
    // The calendar range shows them nothing (only their own).
    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 86_400_000).toISOString();
    expect((await api('plain2', 'get', `/hiring/interviews?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).expect(200)).body).toEqual([]);
    expect(((await api('plain', 'get', `/hiring/interviews?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).expect(200)).body as { id: string }[]).map((r) => r.id)).toEqual([ids.iv]);
  });

  it('515: recruiting reads the board names only, never the feed token or credentials; the full list stays with settings', async () => {
    const names = (await api('rec', 'get', '/organizations/job-boards/names').expect(200)).body as Record<string, unknown>[];
    expect(names).toEqual([{ id: ids.board, name: `Naukri ${run}`, provider: 'xml_feed' }]);
    for (const b of names) expect(Object.keys(b).sort()).toEqual(['id', 'name', 'provider']);
    expect(JSON.stringify(names)).not.toMatch(/feedToken|token|config|secret|apiKey|password/i);
    await api('rec', 'get', '/organizations/job-boards').expect(403);
    await api('rec', 'get', `/organizations/job-boards/${ids.board}/config`).expect(403);
    await api('plain', 'get', '/organizations/job-boards/names').expect(403);
    // Another company sees its own boards only.
    expect(((await api('adminB', 'get', '/organizations/job-boards/names').expect(200)).body as { name: string }[]).map((b) => b.name)).toEqual([`Indeed ${run}`]);
  });
});
