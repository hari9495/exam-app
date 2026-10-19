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

// Recruiter Home (founder decision 19 Oct 2026): GET /workspace/home carries a hiring part for people with a hiring
// key. Every row and number is the person's own: scorecards they owe and interviews they sit on, offers they approve
// or send, and only the jobs they created or manage. Another recruiter's job is never counted; another company never
// shows; someone with no hiring key gets no hiring part at all.

describe('Recruiter Home', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId = '';
  const orgs: Record<'a' | 'b', { id: string; slug: string }> = { a: { id: '', slug: '' }, b: { id: '', slug: '' } };
  type Who = 'admin' | 'rec1' | 'rec2' | 'panel' | 'nobody' | 'recB';
  const home: Record<Who, 'a' | 'b'> = { admin: 'a', rec1: 'a', rec2: 'a', panel: 'a', nobody: 'a', recB: 'b' };
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type TxFn<T> = (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>;
  const inOrg = <T>(org: 'a' | 'b', fn: TxFn<T>) => tenantPrisma.forTenant({ organizationId: orgs[org].id, isSuperAdmin: false }, fn);
  const hiring = async (who: Who) => (await api(who, 'get', '/workspace/home').expect(200)).body.hiring;
  const RECRUITER = ['pipeline:manage', 'candidate:manage', 'interview:view_assigned'];

  /** An interview with a confirmed slot, so it counts as held at that time. */
  const interview = async (who: Who, entryId: string, panel: Who[], startsAt: Date) => {
    const iv = (await api(who, 'post', `/pipeline/entries/${entryId}/interviews`).send({ panelistUserIds: panel.map((w) => users[w]), location: 'Room 4', timeZone: 'Asia/Kolkata', slots: [{ startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 3_600_000).toISOString() }] }).expect(201)).body;
    await inOrg(home[who], async (tx) => {
      const slot = await tx.interviewSlot.findFirstOrThrow({ where: { interviewId: iv.id } });
      await tx.interview.update({ where: { id: iv.id }, data: { status: 'confirmed', confirmedSlotId: slot.id } });
    });
    return iv.id as string;
  };
  const offer = async (who: Who, entryId: string) =>
    (await api(who, 'post', `/pipeline/entries/${entryId}/offers`).send({ compensation: '12 LPA', startDate: '2026-12-01', expiresAt: '2026-11-30' }).expect(201)).body.id as string;
  const statusOf = async (jobId: string, category: string) => {
    const stages = (await api('admin', 'get', `/hiring/jobs/${jobId}/board`).expect(200)).body.pipeline.stages as { category: string; position: number; statuses: { id: string }[] }[];
    return stages.filter((s) => s.category === category).sort((a, b) => a.position - b.position)[0].statuses[0].id;
  };

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

    planId = (await prisma.plan.create({ data: { name: `rhome-plan-${run}`, candidateLimit: 1000, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['a', 'b'] as const) {
      const org = await prisma.organization.create({ data: { name: `Recruiter Home ${k}`, slug: `rhome-${k}-${run}`, planId } });
      orgs[k] = { id: org.id, slug: org.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['rec1', 'recruiter', RECRUITER],
      ['rec2', 'recruiter', RECRUITER],
      ['panel', 'panel', ['interview:view_assigned']],
      ['nobody', 'panel', []],
      ['recB', 'recruiter', RECRUITER],
    ];
    for (const [who, role, keys] of roster) {
      const org = home[who];
      const profileId = keys ? (await inOrg(org, (tx) => tx.permissionProfile.create({ data: { organizationId: orgs[org].id, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg(org, (tx) => tx.user.create({ data: { organizationId: orgs[org].id, email: `${who}@rhome-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId: profileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgs[org].slug, email: `${who}@rhome-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }

    // rec1 owns Plant Engineer; rec2 owns Shift Supervisor; recB is in another company.
    ids.job1 = (await api('rec1', 'post', '/jobs').send({ title: 'Plant Engineer' }).expect(201)).body.id;
    ids.job2 = (await api('rec2', 'post', '/jobs').send({ title: 'Shift Supervisor' }).expect(201)).body.id;
    ids.jobB = (await api('recB', 'post', '/jobs').send({ title: 'Other company job' }).expect(201)).body.id;
    const add = async (who: Who, job: string, k: string) => {
      ids[k] = (await api(who, 'post', `/jobs/${ids[job]}/entries`).send({ newCandidate: { name: `Cand ${k}`, email: `${k}-${run}@x.test` } }).expect(201)).body.id;
    };
    for (const k of ['c1', 'c2', 'c3', 'c4']) await add('rec1', 'job1', k);
    for (const k of ['d1', 'd2']) await add('rec2', 'job2', k);
    await add('recB', 'jobB', 'b1');

    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'Round 1', scaleMax: 4, passBar: 2.5, items: [{ label: 'Safety', weight: 1 }] }).expect(201)).body;
    await api('admin', 'put', `/hiring/jobs/${ids.job1}/scorecard`).send({ templateId: t.id }).expect(200);

    // Held 3 hours ago, panel = the panellist and rec1: both owe a scorecard.
    ids.ivPast = await interview('rec1', ids.c1, ['panel', 'rec1'], new Date(Date.now() - 3 * 3_600_000));
    // Later today (IST) with rec1 on the panel; on rec2's job (no scorecard set), so rec1 sees it only as a panellist.
    const endOfDayIst = new Date(`${new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)}T23:59:00+05:30`);
    ids.ivToday = await interview('rec2', ids.d1, ['rec1'], new Date(Math.min(Date.now() + 30 * 60_000, endOfDayIst.getTime() - 2 * 3_600_000)));

    // c2 has waited 10 days in its first stage; so has rec2's d2 (never shown to rec1).
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    await inOrg('a', (tx) => tx.pipelineEntry.updateMany({ where: { id: { in: [ids.c2, ids.d2] } }, data: { stageEnteredAt: tenDaysAgo } }));

    // c3 hired this week; c4 has a draft offer for rec1 to send; d1 had an offer sent this week (rec2's).
    await api('rec1', 'post', `/hiring/entries/${ids.c3}/move`).send({ statusId: await statusOf(ids.job1, 'hired') }).expect(200);
    ids.offerDraft = await offer('rec1', ids.c4);
    ids.offerSent = await offer('rec2', ids.d1);
    await inOrg('a', (tx) => tx.offer.update({ where: { id: ids.offerSent }, data: { status: 'sent', sentAt: new Date() } }));

    // An offer on rec2's job that waits for rec1's approval.
    await api('admin', 'put', '/organizations/approvals/chains/offer').send({ enabled: true, steps: [{ name: 'Hiring head', approverType: 'users', approverUserIds: [users.rec1] }] }).expect(200);
    ids.offerToApprove = await offer('rec2', ids.d2);
    await api('rec2', 'post', `/offers/${ids.offerToApprove}/submit`).expect(201);
  }, 120_000);

  afterAll(async () => {
    for (const k of ['a', 'b'] as const) await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.delete({ where: { id: orgs[k].id } }).catch(() => undefined));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('gives rec1 their own action rows: scorecards owed, offers to approve or send, candidates waiting', async () => {
    const h = await hiring('rec1');
    expect(h.scorecardsDue.map((r: { interviewId: string }) => r.interviewId)).toEqual([ids.ivPast]);
    expect(h.scorecardsDue[0]).toMatchObject({ candidate: 'Cand c1', job: 'Plant Engineer' });
    expect(h.offers.map((o: { offerId: string; action: string }) => [o.offerId, o.action]).sort()).toEqual([[ids.offerDraft, 'send'], [ids.offerToApprove, 'approve']].sort());
    expect(h.waiting.map((w: { entryId: string }) => w.entryId)).toEqual([ids.c2]);
    expect(h.waiting[0]).toMatchObject({ jobId: ids.job1, candidate: 'Cand c2' });
  });

  it('lists only the interviews rec1 sits on today', async () => {
    const h = await hiring('rec1');
    expect(h.interviewsToday.map((i: { interviewId: string }) => i.interviewId)).toContain(ids.ivToday);
    expect(h.interviewsToday.find((i: { interviewId: string }) => i.interviewId === ids.ivToday)).toMatchObject({ candidate: 'Cand d1', job: 'Shift Supervisor' });
    expect((await hiring('rec2')).interviewsToday).toEqual([]);
  });

  it("counts this week and the open jobs from rec1's own jobs only", async () => {
    const h = await hiring('rec1');
    // 4 applicants on Plant Engineer (rec2's 2 are not counted), 1 first interview, no offer sent on rec1's job, 1 hired.
    expect(h.week).toEqual({ applied: 4, interview: 1, offers: 0, hired: 1 });
    expect(h.jobs.map((j: { id: string }) => j.id)).toEqual([ids.job1]);
    const stages = h.jobs[0].stages as { name: string; count: number }[];
    expect(stages.reduce((n, s) => n + s.count, 0)).toBe(4);
    expect(stages.length).toBeGreaterThan(1);
    expect((await hiring('rec2')).week).toEqual({ applied: 2, interview: 1, offers: 1, hired: 0 });
  });

  it('never shows another company', async () => {
    const b = await hiring('recB');
    expect(b.jobs.map((j: { id: string }) => j.id)).toEqual([ids.jobB]);
    expect(b.week).toEqual({ applied: 1, interview: 0, offers: 0, hired: 0 });
    expect([...b.scorecardsDue, ...b.interviewsToday, ...b.offers, ...b.waiting]).toEqual([]);
    const a = await hiring('rec1');
    expect(JSON.stringify(a)).not.toContain(ids.jobB);
  });

  it('a panellist gets only their own interviews and scorecards; no hiring key means no hiring part', async () => {
    const p = await hiring('panel');
    expect(p.scorecardsDue.map((r: { interviewId: string }) => r.interviewId)).toEqual([ids.ivPast]);
    expect(p).not.toHaveProperty('jobs');
    expect(p).not.toHaveProperty('week');
    expect(p).not.toHaveProperty('waiting');
    expect(p.offers).toEqual([]);
    expect(await hiring('nobody')).toBeUndefined();
  });

  it('a submitted scorecard leaves the list', async () => {
    const iv = (await api('panel', 'get', `/hiring/interviews/${ids.ivPast}`).expect(200)).body;
    await api('panel', 'post', `/hiring/interviews/${ids.ivPast}/scorecard/submit`).send({ ratings: [{ itemId: iv.template.items[0].id, rating: 3 }], recommendation: 'yes' }).expect(200);
    expect((await hiring('panel')).scorecardsDue).toEqual([]);
    expect((await hiring('rec1')).scorecardsDue.map((r: { interviewId: string }) => r.interviewId)).toEqual([ids.ivPast]);
  });
});
