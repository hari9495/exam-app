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
import { quarterIst } from '../src/hiring/careers-admin.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-11 recruiting costs and HIR-12 referrals end to end (docs/yukthix/hiring-design-map.md): who may see and do what
// (HR, recruiter, hiring manager, an employee referring, another company), acting for someone else refused, bad input,
// money in rupees with paise kept exactly, the company's referral bonus and qualifying days, and the stage and joining day.

describe('Hiring HIR-11 costs and HIR-12 referrals', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'hr' | 'recruiter' | 'manager' | 'emp' | 'hrB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setSetting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  const cost = { costType: 'agency_fee', source: 'Sahyadri Staffing', amount: 64000.75, currency: 'INR', period: '2026-10-01', note: '8.33% of first-year CTC' };
  const friend = (over: Record<string, unknown> = {}) => ({ jobId: ids.job, name: 'Ananya Iyer', email: `ananya-${run}@mailbox.in`, phone: '+919876543210', consentGiven: true, ...over });

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

    planId = (await prisma.plan.create({ data: { name: `hir1112-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR1112 Org ${k}`, slug: `hir1112-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string][] = [
      ['hr', 'A', 'org_admin'],
      ['recruiter', 'A', 'recruiter'],
      ['manager', 'A', 'hiring_manager'],
      ['emp', 'A', 'panel'],
      ['hrB', 'B', 'org_admin'],
    ];
    for (const [who, k, role] of roster) {
      const o = org[k].id;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir1112-${run}.test`, name: `${who} ${run}`, passwordHash, role } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir1112-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('hr', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken;
    ids.job = (await api('hr', 'post', '/jobs').send({ title: 'Senior QA Engineer', location: 'Chennai' }).expect(201)).body.id;
    ids.closedJob = (await api('hr', 'post', '/jobs').send({ title: 'Old role', location: 'Hosur' }).expect(201)).body.id;
    await inA((tx) => tx.job.update({ where: { id: ids.closedJob }, data: { status: 'closed' } }));
    ids.jobB = (await api('hrB', 'post', '/jobs').send({ title: 'Accountant', location: 'Pune' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('HIR-11 recruiting costs', () => {
    it('HR adds a cost in rupees with paise; the list joins the job and who entered it', async () => {
      const added = (await api('hr', 'post', '/hiring/costs').send({ ...cost, jobId: ids.job }).expect(201)).body;
      expect(added).toMatchObject({ amount: 64000.75, costType: 'agency_fee', origin: 'manual' });
      ids.cost = added.id;
      const list = (await api('hr', 'get', '/hiring/costs').expect(200)).body;
      expect(list).toEqual([expect.objectContaining({ id: ids.cost, amount: 64000.75, source: 'Sahyadri Staffing', jobTitle: 'Senior QA Engineer', enteredByName: `hr ${run}`, period: expect.stringMatching(/^2026-10-01/) })]);
      // Exactly in the database too (Decimal 14,2, never floating-point drift).
      expect(String(await inA(async (tx) => (await tx.recruitingCost.findUniqueOrThrow({ where: { id: ids.cost } })).amount))).toBe('64000.75');
    });

    it('refuses bad input (400)', async () => {
      for (const bad of [
        { ...cost, amount: -1 },
        { ...cost, amount: 10.005 },
        { ...cost, amount: 1_000_000_001 },
        { ...cost, amount: '4500' },
        { ...cost, costType: 'referral_bonus' },
        { ...cost, currency: 'inr' },
        { ...cost, period: '2026-13-01' },
        { ...cost, source: '   ' },
        { ...cost, source: 'x'.repeat(121) },
        { ...cost, jobId: 'not-a-uuid' },
        { ...cost, origin: 'payroll' },
      ])
        await api('hr', 'post', '/hiring/costs').send(bad).expect(400);
      await api('hr', 'put', '/hiring/costs/not-a-uuid').send(cost).expect(400);
    });

    it('recruiter, hiring manager and employee are refused (403); another company sees nothing and gets 404', async () => {
      for (const who of ['recruiter', 'manager', 'emp'] as const) {
        await api(who, 'get', '/hiring/costs').expect(403);
        await api(who, 'get', '/hiring/costs/overview').expect(403);
        await api(who, 'post', '/hiring/costs').send(cost).expect(403);
        await api(who, 'put', `/hiring/costs/${ids.cost}`).send(cost).expect(403);
        await api(who, 'delete', `/hiring/costs/${ids.cost}`).expect(403);
      }
      expect((await api('hrB', 'get', '/hiring/costs').expect(200)).body).toEqual([]);
      await api('hrB', 'put', `/hiring/costs/${ids.cost}`).send(cost).expect(404);
      await api('hrB', 'delete', `/hiring/costs/${ids.cost}`).expect(404);
      await api('hrB', 'post', '/hiring/costs').send({ ...cost, jobId: ids.job }).expect(404); // A's job
    });

    it('acting for someone else: refused (403)', async () => {
      // Only recruiters, hiring managers and panel members can be acted for, and none holds the costs key, so the key check
      // refuses first; the own-session check is proved on referrals below.
      await api('acting', 'post', '/hiring/costs').send(cost).expect(403);
      await api('acting', 'post', '/referrals').send(friend()).expect(403);
      expect((await api('acting', 'get', '/referrals/mine').expect(200)).body).toEqual([]); // reading stays open
    });

    it('HR changes and deletes a manual cost (audited); an automatic one is refused (409)', async () => {
      const changed = (await api('hr', 'put', `/hiring/costs/${ids.cost}`).send({ ...cost, amount: 60000.5, costType: 'event', source: 'Campus fair, Hosur' }).expect(200)).body;
      expect(changed).toMatchObject({ amount: 60000.5, costType: 'event', jobId: null });
      const auto = await inA((tx) => tx.recruitingCost.create({ data: { organizationId: org.A.id, source: 'Referral: Kiran Rao', costType: 'referral_bonus', amount: 15000, currency: 'INR', origin: 'payroll' } }));
      await api('hr', 'put', `/hiring/costs/${auto.id}`).send(cost).expect(409);
      await api('hr', 'delete', `/hiring/costs/${auto.id}`).expect(409);
      const extra = (await api('hr', 'post', '/hiring/costs').send({ ...cost, amount: 4500 }).expect(201)).body;
      await api('hr', 'delete', `/hiring/costs/${extra.id}`).expect(200);
      await api('hr', 'delete', `/hiring/costs/${extra.id}`).expect(404);
      const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: 'ats.cost.' } }, select: { action: true, metadataJson: true } }));
      expect(audits.map((a) => a.action).sort()).toEqual(['ats.cost.added', 'ats.cost.added', 'ats.cost.changed', 'ats.cost.removed']);
      const change = JSON.parse(audits.find((a) => a.action === 'ats.cost.changed')!.metadataJson!) as { before: { amount: number }; after: { amount: number } };
      expect([change.before.amount, change.after.amount]).toEqual([64000.75, 60000.5]);
    });
  });

  describe('HIR-12 referrals', () => {
    it('the policy is the company setting with defaults (₹25,000 after 90 days)', async () => {
      expect((await api('emp', 'get', '/referrals/policy').expect(200)).body).toEqual({ bonusInr: 25000, qualifyDays: 90 });
      await setSetting('ats.referral.bonus_inr', '20000');
      await setSetting('ats.referral.qualify_days', '60');
      expect((await api('emp', 'get', '/referrals/policy').expect(200)).body).toEqual({ bonusInr: 20000, qualifyDays: 60 });
    });

    it('an employee refers a friend; the bonus promised is kept even when the setting changes later', async () => {
      expect((await api('emp', 'get', '/referrals/jobs').expect(200)).body.map((j: { id: string }) => j.id)).toEqual([ids.job]);
      ids.referral = (await api('emp', 'post', '/referrals').send(friend()).expect(201)).body.id;
      await setSetting('ats.referral.bonus_inr', '50000');
      const mine = (await api('emp', 'get', '/referrals/mine').expect(200)).body;
      expect(mine).toEqual([expect.objectContaining({ id: ids.referral, candidateName: 'Ananya Iyer', jobTitle: 'Senior QA Engineer', stage: 'Applied', joinedOn: null, bonusInr: 20000, rewardStatus: 'pending' })]);
      const audit = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'referral.submitted' } }));
      expect(JSON.parse(audit!.metadataJson!)).toMatchObject({ consentGiven: true });
    });

    it('a hiring manager refers too; each sees only their own referrals', async () => {
      await api('manager', 'post', '/referrals').send(friend({ name: 'Vikram Reddy', email: `vikram-${run}@mailbox.in` })).expect(201);
      expect((await api('manager', 'get', '/referrals/mine').expect(200)).body.map((r: { candidateName: string }) => r.candidateName)).toEqual(['Vikram Reddy']);
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body).toHaveLength(1);
      expect((await api('hrB', 'get', '/referrals/mine').expect(200)).body).toEqual([]);
    });

    it('refuses a repeat (409), a closed job (400), another company’s job (404) and bad input (400)', async () => {
      const dup = await api('emp', 'post', '/referrals').send(friend()).expect(409);
      expect(dup.body.message).toBe('This person has already been referred for this role');
      await api('emp', 'post', '/referrals').send(friend({ jobId: ids.closedJob, email: `x-${run}@mailbox.in` })).expect(400);
      await api('emp', 'post', '/referrals').send(friend({ jobId: ids.jobB, email: `y-${run}@mailbox.in` })).expect(404);
      for (const bad of [friend({ email: 'not-an-email' }), friend({ jobId: 'nope' }), friend({ name: 'x'.repeat(201) }), friend({ consentGiven: 'yes' }), friend({ resumeBase64: '%%%' }), friend({ bonusInr: 1 })])
        await api('emp', 'post', '/referrals').send(bad).expect(400);
    });

    it('a hired referral shows Hired with the joining day (India time); HR turning the reward down shows no bonus', async () => {
      await inA(async (tx) => {
        const ref = await tx.referral.findUniqueOrThrow({ where: { id: ids.referral } });
        const job = await tx.job.findUniqueOrThrow({ where: { id: ids.job }, select: { pipelineId: true } });
        const hired = await tx.pipelineStatus.findFirstOrThrow({ where: { stage: { pipelineId: job.pipelineId!, category: 'hired' } } });
        await tx.pipelineEntry.update({ where: { id: ref.entryId }, data: { statusId: hired.id, stageEnteredAt: new Date() } });
        // 1 Dec 2026 00:30 IST is still 30 Nov in UTC: the joining day must be the Indian date.
        await tx.offer.create({ data: { organizationId: org.A.id, pipelineEntryId: ref.entryId, candidateId: ref.candidateId, compensation: '₹8,40,000', startDate: new Date('2026-11-30T19:00:00Z'), expiresAt: new Date('2026-11-20T00:00:00Z'), status: 'accepted', letterSubject: 'Offer', letterBody: 'Welcome' } });
      });
      const [row] = (await api('emp', 'get', '/referrals/mine').expect(200)).body;
      expect(row).toMatchObject({ stage: 'Hired', joinedOn: '2026-12-01', bonusInr: 20000 });

      // Cost per hire counts this hire in the quarter.
      const q = quarterIst(new Date());
      expect((await api('hr', 'get', '/hiring/costs/overview').expect(200)).body).toMatchObject({ from: q.from, to: q.to, hires: 1, jobs: expect.arrayContaining([{ id: ids.job, title: 'Senior QA Engineer' }]) });
      expect((await api('hrB', 'get', '/hiring/costs/overview').expect(200)).body.hires).toBe(0);

      await api('emp', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'paid' }).expect(403);
      // A recruiter may set rewards, but not while someone acts for them.
      const actingRecruiter = (await api('hr', 'post', `/auth/impersonate/${users.recruiter}`).expect(200)).body.accessToken;
      await request(server()).patch(`/api/v1/referrals/${ids.referral}/reward`).set('Authorization', `Bearer ${actingRecruiter}`).send({ rewardStatus: 'paid' }).expect(403);
      await api('recruiter', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'bogus' }).expect(400);
      await api('hrB', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'paid' }).expect(404);
      await api('hr', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'rejected', rewardNote: 'Left in week 2' }).expect(200);
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body[0]).toMatchObject({ bonusInr: 0, rewardStatus: 'rejected' });
    });

    it('a rejected referral reads Not selected', async () => {
      await inA(async (tx) => {
        const r = await tx.referral.findFirstOrThrow({ where: { referrerUserId: users.manager } });
        await tx.pipelineEntry.update({ where: { id: r.entryId }, data: { rejected: true } });
      });
      expect((await api('manager', 'get', '/referrals/mine').expect(200)).body[0]).toMatchObject({ stage: 'Not selected' });
    });
  });

  it('quarterIst is the calendar quarter in India time', () => {
    expect(quarterIst(new Date('2026-12-31T19:00:00Z'))).toEqual({ from: '2027-01-01', to: '2027-03-31' }); // 1 Jan 00:30 IST
    expect(quarterIst(new Date('2026-11-09T06:00:00Z'))).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(quarterIst(new Date('2028-02-29T06:00:00Z'))).toEqual({ from: '2028-01-01', to: '2028-03-31' });
  });
});
