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
import { ScorecardsService } from '../src/interviewing/scorecards.service';
import { HiringBoardService } from '../src/interviewing/hiring-board.service';

// Recruitment batch AT5 end to end (M10-BUILD-DESIGN §8, §9; D7, J13): scorecard templates with a pass bar; a panellist
// cannot read a colleague's scorecard before submitting their own; a submitted scorecard is final; the result shows
// once every panellist is in; missing scorecards are chased once at 24 h; a rejection message waits and can be
// undone; a test is sent when an application enters its stage; an internal applicant's current manager does not
// see the application before the offer stage, nor ever its test results.

describe('Recruitment batch AT5', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let scorecards: ScorecardsService;
  let board: HiringBoardService;
  const send = jest.fn(async () => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  let orgId = '';
  let orgSlug = '';
  type Who = 'admin' | 'p1' | 'p2' | 'outsider' | 'manager' | 'employee';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type TxFn<T> = (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>;
  const inOrg = <T>(fn: TxFn<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const schedule = async (entryId: string, panel: Who[], endedHoursAgo: number) => {
    const iv = (await api('admin', 'post', `/pipeline/entries/${entryId}/interviews`).send({ panelistUserIds: panel.map((w) => users[w]), location: 'Room 4', timeZone: 'Asia/Kolkata', slots: [{ startsAt: hoursAgo(endedHoursAgo + 1).toISOString(), endsAt: hoursAgo(endedHoursAgo).toISOString() }] }).expect(201)).body;
    await inOrg(async (tx) => {
      const slot = await tx.interviewSlot.findFirstOrThrow({ where: { interviewId: iv.id } });
      await tx.interview.update({ where: { id: iv.id }, data: { status: 'confirmed', confirmedSlotId: slot.id } });
    });
    return iv.id as string;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    scorecards = moduleRef.get(ScorecardsService);
    board = moduleRef.get(HiringBoardService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `ats5-plan-${run}`, candidateLimit: 1000, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const org = await prisma.organization.create({ data: { name: 'ATS5 Org', slug: `ats5-${run}`, planId } });
    orgId = org.id;
    orgSlug = org.slug;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, string, string[] | null][] = [
      ['admin', 'org_admin', null],
      ['p1', 'panel', ['interview:view_assigned']],
      ['p2', 'panel', ['interview:view_assigned']],
      ['outsider', 'panel', ['interview:view_assigned']],
      ['manager', 'panel', ['results:view']],
      ['employee', 'panel', []],
    ];
    for (const [who, role, keys] of roster) {
      const profileId = keys ? (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email: `${who}@ats5-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId: profileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: orgSlug, email: `${who}@ats5-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inOrg((tx) => tx.user.update({ where: { id: users.employee }, data: { managerId: users.manager } }));
    const job = (await api('admin', 'post', '/jobs').send({ title: 'Plant Engineer' }).expect(201)).body;
    ids.job = job.id;
    for (const k of ['c1', 'c2', 'c3']) {
      const e = (await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ newCandidate: { name: `Cand ${k}`, email: `${k}-${run}@x.test` } }).expect(201)).body;
      ids[k] = e.id;
    }
    ids.exam = await inOrg(async (tx) => (await tx.exam.create({ data: { organizationId: orgId, title: 'Plant aptitude', durationMinutes: 30, status: 'published', createdBy: users.admin } })).id);
    await api('admin', 'post', `/jobs/${ids.job}/exams`).send({ examId: ids.exam }).expect(201);
    const boardRes = await api('admin', 'get', `/hiring/jobs/${ids.job}/board`);
    const stages = boardRes.body.pipeline.stages as { id: string; category: string; position: number; statuses: { id: string }[] }[];
    const active = stages.filter((s) => s.category === 'active').sort((a, b) => a.position - b.position);
    ids.stage1Status = active[0].statuses[0].id;
    ids.stage2 = active[1].id;
    ids.stage2Status = active[1].statuses[0].id;
    ids.offerStatus = stages.find((s) => s.category === 'offer')!.statuses[0].id;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, (tx) => tx.organization.delete({ where: { id: orgId } }).catch(() => undefined));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('scorecard templates: weights, a pass bar within the scale, and from the competency library (AT-5.03)', async () => {
    await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'Engineer round 1', scaleMax: 4, passBar: 5, items: [{ label: 'Safety', weight: 1 }] }).expect(400);
    await api('p1', 'post', '/hiring/scorecard-templates').send({ name: 'x', scaleMax: 4, passBar: 2, items: [{ label: 'x', weight: 1 }] }).expect(403);
    const t = (await api('admin', 'post', '/hiring/scorecard-templates').send({ name: 'Engineer round 1', scaleMax: 4, passBar: 2.5, items: [{ label: 'Plant safety', weight: 2 }, { label: 'Communication', weight: 1, guidance: 'Explains clearly' }] }).expect(201)).body;
    ids.template = t.id;
    ids.itemA = t.items[0].id;
    ids.itemB = t.items[1].id;
    await api('admin', 'put', `/hiring/jobs/${ids.job}/scorecard`).send({ templateId: ids.template }).expect(200);
    expect((await api('admin', 'get', `/hiring/jobs/${ids.job}/interview-settings`).expect(200)).body.scorecardTemplateId).toBe(ids.template);
  });

  it('D7: blind until your own is in; final once submitted; result once the whole panel is in (AT-5.04)', async () => {
    ids.iv = await schedule(ids.c1, ['p1', 'p2'], 49);
    await api('outsider', 'get', `/hiring/interviews/${ids.iv}`).expect(403);
    const empty = (await api('p2', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body;
    expect(empty).toMatchObject({ template: { passBar: 2.5, scaleMax: 4 }, scorecards: [], result: null, panel: [expect.objectContaining({ submitted: false }), expect.objectContaining({ submitted: false })] });

    await api('p1', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 4 }], recommendation: 'yes' }).expect(400);
    await api('p1', 'put', `/hiring/interviews/${ids.iv}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 5 }] }).expect(400);
    const s1 = (await api('p1', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 4, notes: 'Knows the plant' }, { itemId: ids.itemB, rating: 1 }], recommendation: 'yes', summary: 'Strong on safety' }).expect(200)).body;
    expect(s1).toMatchObject({ status: 'submitted', weightedScore: 3, passes: true });
    await api('p1', 'put', `/hiring/interviews/${ids.iv}/scorecard`).send({ ratings: [{ itemId: ids.itemB, rating: 4 }] }).expect(409);
    await expect(inOrg((tx) => tx.$executeRaw`UPDATE scorecards SET summary = 'changed' WHERE interview_id = ${ids.iv}::uuid`)).rejects.toThrow(/cannot be changed/);

    // p2 has not submitted: still sees no one else, and no result.
    await api('p2', 'put', `/hiring/interviews/${ids.iv}/scorecard`).send({ ratings: [{ itemId: ids.itemA, rating: 2 }], summary: 'draft' }).expect(200);
    const blind = (await api('p2', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body;
    expect(blind.scorecards.map((c: { mine: boolean; status: string }) => [c.mine, c.status])).toEqual([[true, 'draft']]);
    expect(blind.result).toBeNull();
    // The recruiter sees submitted ones only (not p2's draft).
    const rec = (await api('admin', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body;
    expect(rec.scorecards.map((c: { panelistUserId: string }) => c.panelistUserId)).toEqual([users.p1]);
    expect(rec.result).toMatchObject({ complete: false, submitted: 1, expected: 2 });

    await api('p2', 'post', `/hiring/interviews/${ids.iv}/scorecard/submit`).send({ ratings: [{ itemId: ids.itemA, rating: 2 }, { itemId: ids.itemB, rating: 2 }], recommendation: 'no' }).expect(200);
    const after = (await api('p2', 'get', `/hiring/interviews/${ids.iv}`).expect(200)).body;
    expect(after.scorecards).toHaveLength(2);
    expect(after.result).toMatchObject({ complete: true, score: 2.5, passes: true });
    const row = (await api('admin', 'get', `/hiring/jobs/${ids.job}/board`).expect(200)).body.columns;
    const card = Object.values(row).flat().find((r) => (r as { entryId: string }).entryId === ids.c1) as { scorecards: { passes: boolean }; stageEnteredAt: string };
    expect(card.scorecards).toMatchObject({ complete: true, passes: true });
    expect(card.stageEnteredAt).toBeTruthy();
  });

  it('missing scorecards are chased once at 24 h and once more at 48 h (never twice)', async () => {
    ids.iv2 = await schedule(ids.c2, ['p1'], 25);
    send.mockClear();
    expect(await scorecards.remind()).toBeGreaterThanOrEqual(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: `p1@ats5-${run}.test`, html: expect.stringContaining(`/yx/hiring/interviews/${ids.iv2}`) }));
    send.mockClear();
    await scorecards.remind();
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ to: `p1@ats5-${run}.test` }));
    send.mockClear();
    await scorecards.remind(new Date(Date.now() + 24 * 3_600_000));
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: `p1@ats5-${run}.test`, subject: expect.stringContaining('Second reminder') }));
  });

  it('a rejection message waits and can be undone; after the delay it is sent and undo is refused (AT-5.01)', async () => {
    const before = await inOrg((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.c3 } }));
    send.mockClear();
    const r = (await api('admin', 'post', `/hiring/entries/${ids.c3}/reject`).send({ reason: 'Not enough plant experience', message: { subject: 'Your application', body: 'Thank you, {{candidateName}}.' } }).expect(200)).body;
    expect(r.undoUntil).toBeTruthy();
    expect(send).not.toHaveBeenCalled();
    await api('admin', 'post', `/hiring/entries/${ids.c3}/reject`).send({ reason: 'again' }).expect(409);
    await api('admin', 'post', `/hiring/entries/${ids.c3}/reject/undo`).expect(200);
    expect(await inOrg((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.c3 } }))).toMatchObject({ rejected: false, statusId: before.statusId });

    await api('admin', 'post', `/hiring/entries/${ids.c3}/reject`).send({ reason: 'Not enough plant experience', message: { subject: 'Your application', body: 'Thank you.' } }).expect(200);
    expect(await board.sendDue(new Date(Date.now() + 25 * 3_600_000))).toBeGreaterThanOrEqual(1);
    const mails = await inOrg((tx) => tx.candidateEmail.findMany({ where: { pipelineEntryId: ids.c3 } }));
    expect(mails.map((m) => m.subject)).toEqual(['Your application']);
    await api('admin', 'post', `/hiring/entries/${ids.c3}/reject/undo`).expect(409);
  });

  it('entering a stage sends its linked test once (§9)', async () => {
    await api('admin', 'put', `/hiring/jobs/${ids.job}/exams/${ids.exam}/send-on`).send({ stageId: ids.stage2 }).expect(200);
    await api('admin', 'post', `/hiring/entries/${ids.c2}/move`).send({ statusId: ids.stage2Status }).expect(200);
    const cand = await inOrg((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.c2 }, select: { candidateId: true } }));
    expect(await inOrg((tx) => tx.invitation.count({ where: { candidateId: cand.candidateId, examId: ids.exam } }))).toBe(1);
    await api('admin', 'post', `/hiring/entries/${ids.c2}/move`).send({ statusId: ids.stage1Status }).expect(200);
    await api('admin', 'post', `/hiring/entries/${ids.c2}/move`).send({ statusId: ids.stage2Status }).expect(200);
    expect(await inOrg((tx) => tx.invitation.count({ where: { candidateId: cand.candidateId, examId: ids.exam } }))).toBe(1);
  });

  it('J13: the internal applicant’s current manager sees nothing before the offer stage, and never the test result (AT-5.05)', async () => {
    const cid = await inOrg(async (tx) => (await tx.candidate.create({ data: { organizationId: orgId, name: 'Internal Mover', email: `employee@ats5-${run}.test` } })).id);
    ids.internal = await inOrg(async (tx) => (await tx.pipelineEntry.create({ data: { organizationId: orgId, jobId: ids.job, candidateId: cid, enteredVia: 'internal', referrerUserId: users.employee, statusId: ids.stage1Status, applicationToken: randomUUID() } })).id);
    await api('admin', 'post', `/exams/${ids.exam}/invitations`).send({ candidateIds: [cid] }).expect(201);
    const rows = (who: Who) => api(who, 'get', `/hiring/jobs/${ids.job}/board`).expect(200).then((r) => Object.values(r.body.columns).flat() as { entryId: string; examResults: unknown[] }[]);
    expect((await rows('admin')).find((r) => r.entryId === ids.internal)?.examResults.length).toBe(1);
    expect((await rows('manager')).find((r) => r.entryId === ids.internal)).toBeUndefined();
    expect((await api('manager', 'get', `/jobs/${ids.job}/pipeline`).expect(200)).body.columns).not.toMatchObject({ [ids.internal]: expect.anything() });
    await api('admin', 'post', `/hiring/entries/${ids.internal}/move`).send({ statusId: ids.offerStatus }).expect(200);
    const atOffer = (await rows('manager')).find((r) => r.entryId === ids.internal);
    expect(atOffer).toBeDefined();
    expect(atOffer!.examResults).toEqual([]);
  });
});
