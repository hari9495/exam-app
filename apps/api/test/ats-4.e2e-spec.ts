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
import { CANDIDATE_TABLES } from '../src/talent/merge.service';

// Recruitment batch AT4 end to end (M10-BUILD-DESIGN §7, §13; D10): possible duplicates, merge (moves everything,
// closes the same-job application, tombstone, audited, never undone), talent pools gated by consent, legal hold, and
// the retention sweep (dry run changes nothing; renewal once; anonymisation keeps funnel facts; hold, hired and
// open-process candidates are skipped; a second run changes nothing).

describe('Recruitment batch AT4', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const send = jest.fn(async () => ({ success: true }));
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: '', B: '' };
  const token = { A: '', B: '' };
  const ids: Record<string, string> = {};
  const api = (who: 'A' | 'B', method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type TxFn<T> = (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>;
  const inA = <T>(fn: TxFn<T>) => tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, fn);
  const monthsAgo = (m: number) => new Date(Date.now() - m * 30.5 * 86_400_000);
  const candidate = (name: string, extra: Record<string, unknown> = {}) =>
    inA(async (tx) => (await tx.candidate.create({ data: { organizationId: org.A, name, email: `${name.toLowerCase().replace(/\W+/g, '.')}-${run}@x.test`, portalToken: randomUUID(), ...extra } })).id);
  const apply = (jobId: string, candidateId: string) => api('A', 'post', `/jobs/${jobId}/entries`).send({ candidateId }).expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send }).compile();
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

    planId = (await prisma.plan.create({ data: { name: `ats4-plan-${run}`, candidateLimit: 1000, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ATS4 Org ${k}`, slug: `ats4-${k.toLowerCase()}-${run}`, planId } });
      org[k] = created.id;
      await tenantPrisma.forTenant({ organizationId: created.id, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: created.id, email: `admin@ats4-${k}-${run}.test`, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }));
      token[k] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: created.slug, email: `admin@ats4-${k}-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    ids.job1 = (await api('A', 'post', '/jobs').send({ title: 'Accountant' }).expect(201)).body.id;
    ids.job2 = (await api('A', 'post', '/jobs').send({ title: 'Cashier' }).expect(201)).body.id;
    ids.notice = await inA(async (tx) => (await tx.consentNotice.create({ data: { organizationId: org.A, purpose: 'talent_pool', version: 1, text: 'Keep me for other roles.' } })).id);
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k] } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('every table that points at a candidate is handled by merge (no table can be forgotten)', async () => {
    const rows = await tenantPrisma.forTenant(SUPER, (tx) => tx.$queryRaw<{ t: string }[]>`SELECT table_name AS t FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'candidate_id' ORDER BY 1`);
    expect(rows.map((r) => r.t).sort()).toEqual(Object.keys(CANDIDATE_TABLES).sort());
  });

  it('possible duplicates: the same phone typed two ways, or the same name and number; never across companies (AT-4.01)', async () => {
    ids.kept = await candidate('Priya Raman', { phone: '98450 12345' });
    ids.merged = await candidate('Priya R', { phone: '+91 98450-12345' });
    ids.sameName1 = await candidate('Arun Kumar', { phone: '0044 7700 900123' });
    ids.sameName2 = await candidate('arun kumar ', { phone: '7700-900123' });
    const pairs = (await api('A', 'get', '/hiring/duplicates').expect(200)).body as { a: { id: string }; b: { id: string }; reasons: string[] }[];
    const has = (x: string, y: string) => pairs.find((p) => [p.a.id, p.b.id].sort().join() === [x, y].sort().join());
    expect(has(ids.kept, ids.merged)?.reasons).toEqual(['phone']);
    expect(has(ids.sameName1, ids.sameName2)?.reasons).toEqual(['name_phone']);
    expect((await api('B', 'get', '/hiring/duplicates').expect(200)).body).toEqual([]);
  });

  it('merge moves everything, closes the same-job application, leaves a tombstone, is audited and can never be undone (AT-4.02)', async () => {
    await apply(ids.job1, ids.kept);
    await apply(ids.job1, ids.merged);
    await apply(ids.job2, ids.merged);
    await inA((tx) => tx.candidateConsent.create({ data: { organizationId: org.A, candidateId: ids.merged, noticeId: ids.notice, purpose: 'talent_pool', version: 1, source: 'apply' } }));

    await api('A', 'post', `/hiring/candidates/${ids.kept}/merge`).send({ mergedId: ids.kept }).expect(400);
    await api('B', 'post', `/hiring/candidates/${ids.kept}/merge`).send({ mergedId: ids.merged }).expect(404);
    const res = (await api('A', 'post', `/hiring/candidates/${ids.kept}/merge`).send({ mergedId: ids.merged, name: 'merged' }).expect(200)).body;
    expect(res.choices).toEqual({ name: 'merged', phone: 'kept', resume: 'kept' });
    expect(res.moved).toMatchObject({ pipeline_entries: 1, pipeline_entries_closed: 1, candidate_consents: 1 });

    const [kept, tomb] = await inA((tx) => Promise.all([tx.candidate.findUniqueOrThrow({ where: { id: ids.kept } }), tx.candidate.findUniqueOrThrow({ where: { id: ids.merged } })]));
    expect(kept.name).toBe('Priya R');
    expect(kept.phone).toBe('98450 12345');
    expect(tomb).toMatchObject({ mergedIntoId: ids.kept, status: 'merged', email: `merged-${ids.merged}@merged.invalid` });
    const entries = await inA((tx) => tx.pipelineEntry.findMany({ where: { candidateId: { in: [ids.kept, ids.merged] } }, select: { candidateId: true, jobId: true, archivedAt: true, rejectedReason: true } }));
    expect(entries.filter((e) => e.candidateId === ids.kept).map((e) => e.jobId).sort()).toEqual([ids.job1, ids.job2].sort());
    expect(entries.filter((e) => e.candidateId === ids.merged)).toEqual([expect.objectContaining({ jobId: ids.job1, rejectedReason: 'Merged', archivedAt: expect.any(Date) })]);

    // Both histories show it; the old id leads to the kept candidate; the list hides the tombstone.
    expect((await api('A', 'get', `/hiring/candidates/${ids.merged}`).expect(200)).body).toEqual({ mergedIntoId: ids.kept });
    expect((await api('A', 'get', `/hiring/candidates/${ids.kept}`).expect(200)).body.merges).toEqual([expect.objectContaining({ keptId: ids.kept, mergedId: ids.merged, choices: res.choices })]);
    const list = (await api('A', 'get', '/candidates?pageSize=100').expect(200)).body.data as { id: string }[];
    expect(list.map((c) => c.id)).not.toContain(ids.merged);
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { action: { in: ['ats.candidate.merged', 'ats.candidate.merged_away'] } } }));
    expect(audits).toHaveLength(2);

    // D10: not undoable — merging the tombstone again is refused, and the database refuses to change the record.
    await api('A', 'post', `/hiring/candidates/${ids.kept}/merge`).send({ mergedId: ids.merged }).expect(409);
    await expect(inA((tx) => tx.$executeRaw`DELETE FROM candidate_merges WHERE merged_id = ${ids.merged}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(inA((tx) => tx.$executeRaw`UPDATE candidate_merges SET kept_id = merged_id WHERE merged_id = ${ids.merged}::uuid`)).rejects.toThrow(/permission denied/);
  });

  it('legal hold blocks erasure and being merged away', async () => {
    ids.held = await candidate('Held Person', { phone: '9123456780' });
    await api('A', 'put', `/hiring/candidates/${ids.held}/legal-hold`).send({ on: true }).expect(400);
    await api('A', 'put', `/hiring/candidates/${ids.held}/legal-hold`).send({ on: true, reason: 'Labour court case 12/2026' }).expect(200);
    await api('A', 'post', `/candidates/${ids.held}/erase`).expect(409);
    await api('A', 'post', `/hiring/candidates/${ids.kept}/merge`).send({ mergedId: ids.held }).expect(409);
  });

  it('talent pools take only candidates who agreed; withdrawing takes them out at once; hotlists are separate (AT-4.03)', async () => {
    const pool = (await api('A', 'post', '/hiring/pools').send({ name: 'Finance talent', kind: 'pool' }).expect(201)).body;
    const hot = (await api('A', 'post', '/hiring/pools').send({ name: 'Cashiers this week', kind: 'hotlist' }).expect(201)).body;
    await api('A', 'post', '/hiring/pools').send({ name: 'finance TALENT', kind: 'pool' }).expect(409);
    await api('A', 'post', `/hiring/pools/${pool.id}/members`).send({ candidateIds: [ids.sameName1] }).expect(409);
    // The kept candidate inherited the merged one's talent-pool consent.
    expect((await api('A', 'post', `/hiring/pools/${pool.id}/members`).send({ candidateIds: [ids.kept, ids.sameName1] }).expect(200)).body).toEqual({ added: 1, refused: [ids.sameName1] });
    await api('A', 'post', `/hiring/pools/${hot.id}/members`).send({ candidateIds: [ids.kept] }).expect(200);
    await api('A', 'post', `/hiring/pools/${pool.id}/members`).send({ candidateIds: [ids.merged] }).expect(400);

    const portal = await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: ids.merged }, select: { portalToken: true } }));
    expect((await request(server()).get(`/api/v1/public/portal/${portal.portalToken}`).expect(200)).body).toMatchObject({ candidateName: 'Priya R', talentPool: true });
    await request(server()).post(`/api/v1/public/portal/${portal.portalToken}/talent-pool/withdraw`).expect(200);
    expect((await api('A', 'get', `/hiring/pools/${pool.id}/members`).expect(200)).body.members).toEqual([]);
    expect((await api('A', 'get', `/hiring/pools/${hot.id}/members`).expect(200)).body.members).toHaveLength(1);
    await api('B', 'get', `/hiring/pools/${pool.id}/members`).expect(404);
  });

  describe('retention sweep (AT-4.04)', () => {
    const r: Record<string, string> = {};
    beforeAll(async () => {
      r.old = await candidate('Old Applicant', { createdAt: monthsAgo(13), phone: '9000000001' });
      r.window = await candidate('Window Applicant', { createdAt: monthsAgo(11.5) });
      r.held = await candidate('Old Held', { createdAt: monthsAgo(13), legalHoldAt: new Date(), legalHoldReason: 'Audit' });
      r.hired = await candidate('Old Hired', { createdAt: monthsAgo(13), globalStage: 'hired' });
      r.open = await candidate('Old Open', { createdAt: monthsAgo(13) });
      r.fresh = await candidate('New Applicant');
      await apply(ids.job1, r.old);
      await apply(ids.job2, r.open);
      await inA(async (tx) => {
        await tx.candidateProfile.create({ data: { organizationId: org.A, candidateId: r.old, resumePath: 'candidates/x.pdf', parsedSummary: 'Ten years in audit', embeddingJson: '[0.1,0.2]' } });
        // The applications themselves are old too; the closed one is a finished process.
        await tx.$executeRaw`UPDATE pipeline_entries SET created_at = now() - interval '13 months', updated_at = now() - interval '13 months' WHERE candidate_id IN (${r.old}::uuid, ${r.open}::uuid)`;
        await tx.$executeRaw`UPDATE pipeline_entries SET archived_at = now() - interval '13 months' WHERE candidate_id = ${r.old}::uuid`;
      });
    });
    const mine = (plan: { candidateId: string; action: string }[]) => Object.fromEntries(plan.filter((p) => Object.values(r).includes(p.candidateId)).map((p) => [Object.keys(r).find((k) => r[k] === p.candidateId), p.action]));

    it('a dry run reports what would happen and changes nothing', async () => {
      send.mockClear();
      const dry = (await api('A', 'post', '/hiring/retention/run').send({ dryRun: true }).expect(200)).body;
      expect(dry).toMatchObject({ dryRun: true, runId: null, periodMonths: 12 });
      expect(mine(dry.plan)).toEqual({ old: 'anonymised', window: 'renewal_sent', held: 'skipped_hold', hired: 'skipped_hired', open: 'skipped_open' });
      expect(send).not.toHaveBeenCalled();
      const old = await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: r.old } }));
      expect(old).toMatchObject({ name: 'Old Applicant', erasedAt: null });
      expect(await inA((tx) => tx.candidateRetentionRun.count())).toBe(0);
    });

    it('a run sends one renewal, anonymises (funnel facts kept), skips hold / hired / open, and logs each', async () => {
      send.mockClear();
      const res = (await api('A', 'post', '/hiring/retention/run').send({ dryRun: false }).expect(200)).body;
      expect(mine(res.plan)).toEqual({ old: 'anonymised', window: 'renewal_sent', held: 'skipped_hold', hired: 'skipped_hired', open: 'skipped_open' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: `window.applicant-${run}@x.test`, html: expect.stringContaining('/portal/') }));

      const [old, profile, entries, held] = await inA((tx) => Promise.all([
        tx.candidate.findUniqueOrThrow({ where: { id: r.old } }),
        tx.candidateProfile.findUniqueOrThrow({ where: { candidateId: r.old } }),
        tx.pipelineEntry.count({ where: { candidateId: r.old } }),
        tx.candidate.findUniqueOrThrow({ where: { id: r.held } }),
      ]));
      expect(old).toMatchObject({ name: 'Redacted', phone: null, erasedAt: expect.any(Date) });
      expect(profile).toMatchObject({ resumePath: null, parsedSummary: null, embeddingJson: null });
      expect(entries).toBe(1); // funnel facts stay
      expect(held).toMatchObject({ name: 'Old Held', erasedAt: null });

      const { runs, months } = (await api('A', 'get', '/hiring/retention/runs').expect(200)).body;
      expect(months).toBe(12);
      expect(runs[0]).toMatchObject({ renewalsSent: 1, anonymised: 1, skippedHold: 1, skippedOpen: 1, skippedHired: 1, triggeredBy: expect.any(String) });
      const actions = await inA((tx) => tx.candidateRetentionAction.findMany({ where: { runId: runs[0].id } }));
      expect(actions.map((a) => a.action).sort()).toEqual(['anonymised', 'renewal_sent', 'skipped_hired', 'skipped_hold', 'skipped_open']);
      const audit = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'candidate.erased', entityId: r.old } }));
      expect(audit?.metadataJson ?? JSON.stringify(audit)).toContain('retention');
      await expect(inA((tx) => tx.$executeRaw`DELETE FROM candidate_retention_actions WHERE run_id = ${runs[0].id}::uuid`)).rejects.toThrow(/permission denied/);
    });

    it('a second run changes nothing new (idempotent), and renewing from the email link stops the clock', async () => {
      send.mockClear();
      const again = (await api('A', 'post', '/hiring/retention/run').send({ dryRun: false }).expect(200)).body;
      expect(mine(again.plan)).toEqual({ held: 'skipped_hold', hired: 'skipped_hired', open: 'skipped_open' });
      expect(send).not.toHaveBeenCalled();

      const t = await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: r.window }, select: { portalToken: true } }));
      await request(server()).post(`/api/v1/public/portal/${t.portalToken}/stay`).expect(200);
      const consent = await inA((tx) => tx.candidateConsent.findFirst({ where: { candidateId: r.window, purpose: 'talent_pool' } }));
      expect(consent).toMatchObject({ source: 'renewal', version: 1 });
      const dry = (await api('A', 'post', '/hiring/retention/run').send({ dryRun: true }).expect(200)).body;
      expect(mine(dry.plan).window).toBeUndefined();
      expect((await api('A', 'get', `/hiring/candidates/${r.window}`).expect(200)).body.retention.until).toBeTruthy();
      expect((await api('B', 'post', '/hiring/retention/run').send({ dryRun: true }).expect(200)).body.plan).toEqual([]);
    });
  });
});
