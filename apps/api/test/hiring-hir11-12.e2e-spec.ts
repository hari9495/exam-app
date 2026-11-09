import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { ReferralsService } from '../src/referrals/referrals.service';
import { PrismaClient } from '@prisma/client';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { quarterIst } from '../src/hiring/careers-admin.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-11 recruiting costs and HIR-12 referrals end to end (docs/yukthix/hiring-design-map.md, founder answers 201-207):
// who may see and do what (HR, recruiter, hiring manager, an employee referring, settings-only admin, another company),
// acting for someone else refused, bad input, money in rupees with paise kept exactly, months of the current quarter,
// the referral bonus settings, no credit for a recent own application, the joining day and exit from People, and HR's
// All referrals with Mark bonus paid handing payroll a one-time Referral bonus line for the referrer (answer 231); the
// read-only Referral bonus cost is posted when the run that pays it is approved; a pending resignation holds the bonus (234).

jest.setTimeout(120_000);

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
  type Who = 'hr' | 'recruiter' | 'manager' | 'emp' | 'settingsOnly' | 'hrEntity' | 'hrB' | 'acting' | 'actingRecruiter';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const Q = quarterIst(new Date());
  const lastQuarterMonth = (() => {
    const [y, m] = Q.from.split('-').map(Number) as [number, number];
    return m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
  })();
  const nextQuarterMonth = (() => {
    const [y, m] = Q.to.split('-').map(Number) as [number, number];
    return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  })();
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  // Payroll rows (a run, a payslip) are written with the schema owner, as payroll's own calculation would.
  const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  let referrals: ReferralsService;
  /** The schema owner, as the platform (forced row-level security applies to the owner too). */
  const sudo = <T>(fn: (t: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>) => owner.$transaction(async (t) => (await t.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`, await t.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`, fn(t)));
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setSetting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  const cost = { costType: 'agency_fee', source: 'Sahyadri Staffing', amount: 64000.75, currency: 'INR', period: Q.from, note: '8.33% of first-year CTC' };
  const friend = (over: Record<string, unknown> = {}) => ({ jobId: ids.job, name: 'Ananya Iyer', email: `ananya-${run}@mailbox.in`, phone: '+919876543210', consentGiven: true, ...over });
  /** Puts a referral's application in the hired stage with an accepted offer starting on `start`. */
  const hire = (referralId: string, start: Date) =>
    inA(async (tx) => {
      const ref = await tx.referral.findUniqueOrThrow({ where: { id: referralId } });
      const job = await tx.job.findUniqueOrThrow({ where: { id: ids.job }, select: { pipelineId: true } });
      const hired = await tx.pipelineStatus.findFirstOrThrow({ where: { stage: { pipelineId: job.pipelineId!, category: 'hired' } } });
      await tx.pipelineEntry.update({ where: { id: ref.entryId }, data: { statusId: hired.id, stageEnteredAt: new Date() } });
      return tx.offer.create({ data: { organizationId: org.A.id, pipelineEntryId: ref.entryId, candidateId: ref.candidateId, compensation: '₹8,40,000', startDate: start, expiresAt: new Date('2026-01-01T00:00:00Z'), status: 'accepted', letterSubject: 'Offer', letterBody: 'Welcome' } });
    });
  /** A candidate already in the job's pipeline, entered by `via`, `daysAgo` days ago. */
  const applied = (email: string, via: string, daysAgo: number) =>
    inA(async (tx) => {
      const cand = await tx.candidate.create({ data: { organizationId: org.A.id, email, name: 'Own Applicant', portalToken: randomUUID() } });
      await tx.pipelineEntry.create({ data: { organizationId: org.A.id, jobId: ids.job, candidateId: cand.id, enteredVia: via, applicationToken: randomUUID(), createdAt: new Date(Date.now() - daysAgo * 86_400_000) } });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    referrals = moduleRef.get(ReferralsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `hir1112-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR1112 Org ${k}`, slug: `hir1112-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    // settingsOnly: a company admin with only the settings key (founder answer 202: no longer enough for costs).
    const settingsProfile = await inA(async (tx) => (await tx.permissionProfile.create({ data: { organizationId: org.A.id, name: `settings-${run}`, permissionsJson: JSON.stringify(['org:manage_settings']) } })).id);
    const roster: [Exclude<Who, 'acting' | 'actingRecruiter'>, 'A' | 'B', string, string | null][] = [
      ['hr', 'A', 'org_admin', null],
      ['recruiter', 'A', 'recruiter', null],
      ['manager', 'A', 'hiring_manager', null],
      ['emp', 'A', 'panel', null],
      ['settingsOnly', 'A', 'panel', settingsProfile],
      ['hrEntity', 'A', 'panel', null],
      ['hrB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, permissionProfileId] of roster) {
      const o = org[k].id;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir1112-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir1112-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('hr', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken;
    token.actingRecruiter = (await api('hr', 'post', `/auth/impersonate/${users.recruiter}`).expect(200)).body.accessToken;
    ids.job = (await api('hr', 'post', '/jobs').send({ title: 'Senior QA Engineer', location: 'Chennai' }).expect(201)).body.id;
    ids.closedJob = (await api('hr', 'post', '/jobs').send({ title: 'Old role', location: 'Hosur' }).expect(201)).body.id;
    await inA((tx) => tx.job.update({ where: { id: ids.closedJob }, data: { status: 'closed' } }));
    ids.jobB = (await api('hrB', 'post', '/jobs').send({ title: 'Accountant', location: 'Pune' }).expect(201)).body.id;

    // People masters, for a joiner made from an accepted offer (founder answer 205 reads the exit from People).
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: `KF-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'QA Engineer', code: 'QAE' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      // hrEntity: both keys granted for one legal entity only (how the HR Admin template is usually granted).
      const profile = await tx.permissionProfile.create({ data: { ...o, name: `hr-entity-${run}`, permissionsJson: JSON.stringify(['ats.costs.manage', 'ats.referral.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.hrEntity!, permissionProfileId: profile.id, scopeType: 'legal_entity', legalEntityId: ids.entity, validFrom: new Date('2026-01-01'), status: 'active', reason: 'HR for Kaveri Foods' } });
    });
    // Answer 231: the employee who refers is paid the bonus through payroll, so emp is an employee with a sign-in.
    ids.empEmployee = (await api('hr', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Referrer in the referral tests', givenName: 'Arjun', familyName: `Kulkarni ${run}`, employeeCode: `REF-${run}`, joinedOn: '2025-04-01', assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id;
    await sudo((t) => t.employee.update({ where: { id: ids.empEmployee }, data: { userId: users.emp! } }));
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await owner.$disconnect();
    await app.close();
  });

  describe('HIR-11 recruiting costs', () => {
    it('HR adds a cost in rupees with paise; the list joins the job and who entered it', async () => {
      const added = (await api('hr', 'post', '/hiring/costs').send({ ...cost, jobId: ids.job }).expect(201)).body;
      expect(added).toMatchObject({ amount: 64000.75, costType: 'agency_fee', origin: 'manual' });
      ids.cost = added.id;
      const list = (await api('hr', 'get', '/hiring/costs').expect(200)).body;
      expect(list).toEqual([expect.objectContaining({ id: ids.cost, amount: 64000.75, source: 'Sahyadri Staffing', jobTitle: 'Senior QA Engineer', enteredByName: `hr ${run}`, period: expect.stringMatching(new RegExp(`^${Q.from}`)) })]);
      // Exactly in the database too (Decimal 14,2, never floating-point drift).
      expect(String(await inA(async (tx) => (await tx.recruitingCost.findUniqueOrThrow({ where: { id: ids.cost } })).amount))).toBe('64000.75');
    });

    it('any month of this quarter (India time) is accepted; a month outside it is refused (answer 206)', async () => {
      const last = (await api('hr', 'post', '/hiring/costs').send({ ...cost, amount: 100, period: Q.to.slice(0, 8) + '01' }).expect(201)).body;
      await api('hr', 'delete', `/hiring/costs/${last.id}`).expect(200);
      for (const period of [lastQuarterMonth, nextQuarterMonth]) {
        const res = await api('hr', 'post', '/hiring/costs').send({ ...cost, period }).expect(400);
        expect(res.body.message).toBe('Choose a month of this quarter.');
      }
      // An older cost keeps its own month when edited, but cannot be moved to another month outside the quarter.
      const old = await inA((tx) => tx.recruitingCost.create({ data: { organizationId: org.A.id, source: 'Naukri', costType: 'job_board', amount: 4500, currency: 'INR', period: new Date(lastQuarterMonth), enteredBy: users.hr } }));
      await api('hr', 'put', `/hiring/costs/${old.id}`).send({ ...cost, period: lastQuarterMonth, amount: 5000 }).expect(200);
      await api('hr', 'put', `/hiring/costs/${old.id}`).send({ ...cost, period: '2020-01-01' }).expect(400);
      await api('hr', 'delete', `/hiring/costs/${old.id}`).expect(200);
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
        { ...cost, sourceRef: 'referral:x' },
      ])
        await api('hr', 'post', '/hiring/costs').send(bad).expect(400);
      await api('hr', 'put', '/hiring/costs/not-a-uuid').send(cost).expect(400);
    });

    it('the costs key (answer 202): recruiters may; the settings key alone, managers and employees may not; another company gets 404', async () => {
      expect((await api('recruiter', 'get', '/hiring/costs').expect(200)).body).toHaveLength(1);
      await api('recruiter', 'get', '/hiring/costs/overview').expect(200);
      const r = (await api('recruiter', 'post', '/hiring/costs').send({ ...cost, amount: 1200, costType: 'event', source: 'Campus fair' }).expect(201)).body;
      await api('recruiter', 'delete', `/hiring/costs/${r.id}`).expect(200);
      for (const who of ['settingsOnly', 'manager', 'emp'] as const) {
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
      // The template carries the key: HR Admin and Recruiter templates (company roles copy them).
      const { ROLE_TEMPLATES } = await import('../src/access/role-templates');
      expect(ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions).toEqual(expect.arrayContaining(['ats.costs.manage', 'ats.referral.manage']));
      expect(ROLE_TEMPLATES.find((t) => t.key === 'recruiter')!.permissions).toContain('ats.costs.manage');
    });

    it('the key granted for one legal entity only confers nothing: costs and All referrals are company-wide (403)', async () => {
      for (const [m, path] of [['get', '/hiring/costs'], ['get', '/hiring/costs/overview'], ['get', '/referrals']] as const) {
        const res = await api('hrEntity', m, path).expect(403);
        expect(res.body.message).toMatch(/company-wide/);
      }
      await api('hrEntity', 'post', '/hiring/costs').send(cost).expect(403);
    });

    it('acting for someone else cannot add, change or delete a cost, even for a recruiter who holds the key (403)', async () => {
      await api('actingRecruiter', 'get', '/hiring/costs').expect(200); // reading stays open
      await api('actingRecruiter', 'post', '/hiring/costs').send(cost).expect(403);
      await api('actingRecruiter', 'put', `/hiring/costs/${ids.cost}`).send(cost).expect(403);
      await api('actingRecruiter', 'delete', `/hiring/costs/${ids.cost}`).expect(403);
      await api('acting', 'post', '/referrals').send(friend()).expect(403);
      expect((await api('acting', 'get', '/referrals/mine').expect(200)).body).toEqual([]);
    });

    it('HR changes and deletes a manual cost (audited); an automatic one is refused (409)', async () => {
      const changed = (await api('hr', 'put', `/hiring/costs/${ids.cost}`).send({ ...cost, amount: 60000.5, costType: 'event', source: 'Campus fair, Hosur' }).expect(200)).body;
      expect(changed).toMatchObject({ amount: 60000.5, costType: 'event', jobId: null });
      const auto = await inA((tx) => tx.recruitingCost.create({ data: { organizationId: org.A.id, source: 'Aptitude test', costType: 'assessment', amount: 15000, currency: 'INR', origin: 'assessment' } }));
      await api('hr', 'put', `/hiring/costs/${auto.id}`).send(cost).expect(409);
      await api('hr', 'delete', `/hiring/costs/${auto.id}`).expect(409);
      await inA((tx) => tx.recruitingCost.delete({ where: { id: auto.id } }));
      const extra = (await api('hr', 'post', '/hiring/costs').send({ ...cost, amount: 4500 }).expect(201)).body;
      await api('hr', 'delete', `/hiring/costs/${extra.id}`).expect(200);
      await api('hr', 'delete', `/hiring/costs/${extra.id}`).expect(404);
      const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'ats.cost.changed', entityId: ids.cost }, select: { metadataJson: true } }));
      const change = JSON.parse(audits[0]!.metadataJson!) as { before: { amount: number }; after: { amount: number } };
      expect([change.before.amount, change.after.amount]).toEqual([64000.75, 60000.5]);
    });
  });

  describe('HIR-12 referrals', () => {
    it('the policy is the company setting with defaults (₹25,000 after 90 days; no credit for an own application within 90 days)', async () => {
      expect((await api('emp', 'get', '/referrals/policy').expect(200)).body).toEqual({ bonusInr: 25000, qualifyDays: 90, selfApplyDays: 90 });
      await setSetting('ats.referral.bonus_inr', '20000');
      await setSetting('ats.referral.qualify_days', '60');
      expect((await api('emp', 'get', '/referrals/policy').expect(200)).body).toEqual({ bonusInr: 20000, qualifyDays: 60, selfApplyDays: 90 });
    });

    it('an employee refers a friend; the bonus promised is kept even when the setting changes later', async () => {
      expect((await api('emp', 'get', '/referrals/jobs').expect(200)).body.map((j: { id: string }) => j.id)).toEqual([ids.job]);
      ids.referral = (await api('emp', 'post', '/referrals').send(friend()).expect(201)).body.id;
      await setSetting('ats.referral.bonus_inr', '50000');
      const mine = (await api('emp', 'get', '/referrals/mine').expect(200)).body;
      expect(mine).toEqual([expect.objectContaining({ id: ids.referral, candidateName: 'Ananya Iyer', jobTitle: 'Senior QA Engineer', stage: 'Applied', joinedOn: null, bonusInr: 20000, rewardStatus: 'pending', bonusDue: 'not-hired' })]);
      const audit = await inA((tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'referral.submitted' } }));
      expect(JSON.parse(audit!.metadataJson!)).toMatchObject({ consentGiven: true });
    });

    it('no credit when the person applied on their own within the set days (answer 201); credit when older, or added by the company', async () => {
      await applied(`own-recent-${run}@mailbox.in`, 'application', 10);
      const res = await api('emp', 'post', '/referrals').send(friend({ email: `own-recent-${run}@mailbox.in` })).expect(409);
      expect(res.body.message).toBe("This person applied for this job on their own in the last 90 days, so the referral can't be credited");
      await applied(`own-old-${run}@mailbox.in`, 'application', 100);
      await api('emp', 'post', '/referrals').send(friend({ email: `own-old-${run}@mailbox.in` })).expect(201);
      await applied(`added-${run}@mailbox.in`, 'manual', 1);
      await api('emp', 'post', '/referrals').send(friend({ email: `added-${run}@mailbox.in` })).expect(201);
      await setSetting('ats.referral.self_apply_days', '30');
      await applied(`own-40-${run}@mailbox.in`, 'reapply', 40);
      await api('emp', 'post', '/referrals').send(friend({ email: `own-40-${run}@mailbox.in` })).expect(201);
      await setSetting('ats.referral.self_apply_days', '0');
      await api('emp', 'post', '/referrals').send(friend({ email: `own-recent-${run}@mailbox.in` })).expect(201);
      await setSetting('ats.referral.self_apply_days', '90');
    });

    it('a hiring manager refers too; each sees only their own referrals', async () => {
      await api('manager', 'post', '/referrals').send(friend({ name: 'Vikram Reddy', email: `vikram-${run}@mailbox.in` })).expect(201);
      expect((await api('manager', 'get', '/referrals/mine').expect(200)).body.map((r: { candidateName: string }) => r.candidateName)).toEqual(['Vikram Reddy']);
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body).toHaveLength(5);
      expect((await api('hrB', 'get', '/referrals/mine').expect(200)).body).toEqual([]);
    });

    it('refuses a repeat (409), a closed job (400), another company’s job (404) and bad input (400)', async () => {
      const dup = await api('emp', 'post', '/referrals').send(friend()).expect(409);
      expect(dup.body.message).toBe('This person has already been referred for this role');
      await api('emp', 'post', '/referrals').send(friend({ jobId: ids.closedJob, email: `x-${run}@mailbox.in` })).expect(400);
      await api('emp', 'post', '/referrals').send(friend({ jobId: ids.jobB, email: `y-${run}@mailbox.in` })).expect(404);
      for (const bad of [friend({ email: 'not-an-email' }), friend({ jobId: 'nope' }), friend({ name: 'x'.repeat(201) }), friend({ consentGiven: 'yes' }), friend({ resumeBase64: '%%%' }), friend({ bonusInr: 1 })])
        await api('emp', 'post', '/referrals').send(bad).expect(400);
      // A résumé is checked by its real content: an .exe sent as base64 is refused and nobody is referred.
      const fake = friend({ email: `fake-pdf-${run}@mailbox.in`, resumeBase64: Buffer.from('MZ not a pdf').toString('base64') });
      expect((await api('emp', 'post', '/referrals').send(fake).expect(400)).body.message).toBe('The résumé must be a PDF file.');
      expect(await inA((tx) => tx.candidate.count({ where: { email: `fake-pdf-${run}@mailbox.in` } }))).toBe(0);
    });

    it('All referrals (answer 204): HR sees every referral with who referred; employees and the settings key alone may not', async () => {
      const all = (await api('hr', 'get', '/referrals').expect(200)).body as { candidateName: string; referrerName: string }[];
      expect(all).toHaveLength(6);
      expect(all.find((r) => r.candidateName === 'Vikram Reddy')).toMatchObject({ referrerName: `manager ${run}` });
      for (const who of ['emp', 'settingsOnly'] as const) await api(who, 'get', '/referrals').expect(403);
      expect((await api('hrB', 'get', '/referrals').expect(200)).body).toEqual([]);
    });

    it('a hire not yet due cannot be marked paid; the joining day is the Indian date; cost per hire counts it', async () => {
      // 1 Dec 2026 00:30 IST is still 30 Nov in UTC: the joining day must be the Indian date.
      await hire(ids.referral, new Date('2026-11-30T19:00:00Z'));
      const [row] = (await api('emp', 'get', '/referrals/mine').expect(200)).body.filter((r: { id: string }) => r.id === ids.referral);
      expect(row).toMatchObject({ stage: 'Hired', joinedOn: '2026-12-01', eligibleOn: '2027-01-30', bonusInr: 20000, bonusDue: 'waiting' });
      const early = await api('hr', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'paid' }).expect(409);
      expect(early.body.message).toBe('The bonus is due on 30 Jan 2027. Mark it paid after that.');

      expect((await api('hr', 'get', '/hiring/costs/overview').expect(200)).body).toMatchObject({ from: Q.from, to: Q.to, hires: 1, jobs: expect.arrayContaining([{ id: ids.job, title: 'Senior QA Engineer' }]) });
      expect((await api('hrB', 'get', '/hiring/costs/overview').expect(200)).body.hires).toBe(0);

      await api('emp', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'paid' }).expect(403);
      await api('actingRecruiter', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'rejected' }).expect(403);
      await api('recruiter', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'bogus' }).expect(400);
      await api('hrB', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'paid' }).expect(404);
      await api('hr', 'patch', `/referrals/${ids.referral}/reward`).send({ rewardStatus: 'rejected', rewardNote: 'Policy exception' }).expect(200);
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body.find((r: { id: string }) => r.id === ids.referral)).toMatchObject({ bonusInr: 0, rewardStatus: 'rejected', bonusDue: 'none' });
    });

    it('a joiner who leaves before the qualifying day gets no bonus (answer 205); a pending resignation holds it (234); once due, HR marks it paid: a payroll line, the cost on approval (231)', async () => {
      ids.ref2 = (await api('emp', 'post', '/referrals').send(friend({ name: 'Rohit Bhat', email: `rohit-${run}@mailbox.in` })).expect(201)).body.id;
      const offer = await hire(ids.ref2, new Date('2026-01-05T00:00:00+05:30'));
      // The joiner in People, made from the accepted offer, joined on 5 Jan 2026 (qualifying day 6 Mar 2026 at 60 days).
      const empId = (await api('hr', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Joined from a referral in January', givenName: 'Rohit', familyName: `Bhat ${run}`, employeeCode: `HR12-${run}`, joinedOn: '2026-01-05', assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201)).body.id as string;
      const exitId = await inA(async (tx) => {
        const emp = await tx.employee.findUniqueOrThrow({ where: { id: empId } });
        const employment = await tx.employment.findFirstOrThrow({ where: { employeeId: empId } });
        await tx.preboarding.create({ data: { organizationId: org.A.id, personId: emp.personId, source: 'offer', joiningOn: new Date('2026-01-05'), legalEntityId: ids.entity, locationId: ids.loc, hrOwnerUserId: users.hr!, status: 'joined', employmentId: employment.id, offerId: offer.id } });
        return (await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: employment.id, employeeId: empId, personId: emp.personId, exitType: 'termination', initiatedBy: 'company', submittedOn: new Date('2026-02-01'), noticePeriod: '0d', standardLwd: new Date('2026-02-20'), approvedLwd: new Date('2026-02-20'), status: 'accepted' } })).id;
      });
      const left = (await api('emp', 'get', '/referrals/mine').expect(200)).body.find((r: { id: string }) => r.id === ids.ref2);
      expect(left).toMatchObject({ stage: 'Hired', joinedOn: '2026-01-05', eligibleOn: '2026-03-06', leftOn: '2026-02-20', bonusDue: 'left', bonusInr: 0 });
      expect((await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'paid' }).expect(409)).body.message).toBe('They left before the qualifying day, so no bonus is due.');

      // A withdrawn exit (or one after the qualifying day) leaves the bonus due.
      await inA((tx) => tx.exitCase.update({ where: { id: exitId }, data: { approvedLwd: new Date('2026-06-30'), standardLwd: new Date('2026-06-30') } }));
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body.find((r: { id: string }) => r.id === ids.ref2)).toMatchObject({ bonusDue: 'due', bonusInr: 50000 });

      // Answer 234: a resignation waiting for approval holds the bonus (both lists); paid is refused with the reason.
      const resignation = await inA(async (tx) => {
        const e = await tx.exitCase.findUniqueOrThrow({ where: { id: exitId } });
        await tx.exitCase.update({ where: { id: exitId }, data: { status: 'withdrawn' } });
        return (await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: e.employmentId, employeeId: e.employeeId, personId: e.personId, exitType: 'resignation', initiatedBy: 'employee', submittedOn: new Date('2026-07-01'), noticePeriod: '30d', standardLwd: new Date('2026-07-31'), status: 'submitted' } })).id;
      });
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body.find((r: { id: string }) => r.id === ids.ref2)).toMatchObject({ bonusDue: 'on-hold', bonusInr: 50000 });
      expect((await api('hr', 'get', '/referrals').expect(200)).body.find((r: { id: string }) => r.id === ids.ref2)).toMatchObject({ bonusDue: 'on-hold', paidVia: null, referrerIsEmployee: true });
      expect((await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'paid' }).expect(409)).body.message).toBe('Their resignation is waiting for approval, so the bonus is on hold. Mark it paid after the exit is decided.');
      await inA((tx) => tx.exitCase.update({ where: { id: resignation }, data: { status: 'withdrawn' } }));
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body.find((r: { id: string }) => r.id === ids.ref2)).toMatchObject({ bonusDue: 'due' });

      // Answer 231: paid hands payroll one approved Referral bonus line for the referrer; no cost until a run pays it.
      const line = () => sudo((t) => t.oneTimePay.findMany({ where: { organizationId: org.A.id, source: 'm10', sourceRef: `referral:${ids.ref2}` }, orderBy: { createdAt: 'asc' } }));
      const paid = (await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'paid' }).expect(200)).body;
      await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'paid' }).expect(200); // a repeat adds no second line
      const lines = await line();
      expect(lines).toEqual([expect.objectContaining({ employeeId: ids.empEmployee, componentCode: 'referral_bonus', status: 'approved', reason: 'Referral bonus: Rohit Bhat (Senior QA Engineer)' })]);
      expect(String(lines[0]!.amount)).toBe('50000');
      expect(lines[0]!.periodStart.toISOString().slice(0, 7)).toBe(paid.payMonth);
      const bonusCosts = async () => (await api('hr', 'get', '/hiring/costs').expect(200)).body.filter((c: { costType: string }) => c.costType === 'referral_bonus');
      expect(await bonusCosts()).toEqual([]);
      expect((await api('emp', 'get', '/referrals/mine').expect(200)).body.find((r: { id: string }) => r.id === ids.ref2)).toMatchObject({ rewardStatus: 'paid', bonusDue: 'paid' });

      // Undo before any approved run: the line is cancelled.
      await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'approved' }).expect(200);
      expect((await line()).map((l) => l.status)).toEqual(['cancelled']);
      // Paid again: a new line; a draft run with it does not post the cost; its approval does, once.
      await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'paid' }).expect(200);
      const live = (await line()).find((l) => l.status === 'approved')!;
      const group = await sudo((t) => t.payGroup.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, name: `Monthly ${run}` } }));
      const runRow = await sudo((t) => t.payrollRun.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, payGroupId: group.id, periodStart: live.periodStart, periodEnd: live.periodStart, preparedBy: users.hr!, status: 'draft' } }));
      const slip = await sudo((t) => t.payslip.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, runId: runRow.id, employmentId: live.employmentId, employeeId: live.employeeId, periodStart: live.periodStart, calcVersion: 1, status: 'draft', gross: 50000, deductions: 0, net: 50000, employerCost: 50000, ruleVersions: {}, snapshotHash: 'a'.repeat(64), resultHash: 'b'.repeat(64) } }));
      await sudo((t) => t.payslipLine.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: live.employeeId, payslipId: slip.id, position: 0, componentCode: 'referral_bonus', name: 'Referral bonus', kind: 'earning', amount: 50000, explanation: 'One-time pay', sourceRef: live.id } }));
      expect(await referrals.postPaidCosts(org.A.id, runRow.id)).toEqual([]);
      expect(await bonusCosts()).toEqual([]);
      await sudo((t) => t.payrollRun.update({ where: { id: runRow.id }, data: { status: 'approved' } }));
      await sudo((t) => t.payslip.update({ where: { id: slip.id }, data: { status: 'approved' } }));
      expect(await referrals.postPaidCosts(org.A.id, runRow.id)).toEqual([ids.ref2]);
      expect(await referrals.postPaidCosts(org.A.id, runRow.id)).toEqual([]); // once
      const posted = await bonusCosts();
      expect(posted).toEqual([expect.objectContaining({ source: 'Referral: Rohit Bhat', amount: 50000, origin: 'payroll', jobTitle: 'Senior QA Engineer', sourceRef: `referral:${ids.ref2}` })]);
      expect(posted[0].period.slice(0, 7)).toBe(live.periodStart.toISOString().slice(0, 7));
      await api('hr', 'put', `/hiring/costs/${posted[0].id}`).send(cost).expect(409);
      await api('hr', 'delete', `/hiring/costs/${posted[0].id}`).expect(409);
      // Another company's run never posts here.
      expect(await referrals.postPaidCosts(org.B.id, runRow.id)).toEqual([]);

      // Undo after the approved run is refused with the reason; nothing changes.
      expect((await api('hr', 'patch', `/referrals/${ids.ref2}/reward`).send({ rewardStatus: 'approved' }).expect(409)).body.message).toBe(`The bonus was paid in the approved ${live.periodStart.toISOString().slice(0, 7)} payroll, so it cannot be undone here. Payroll recovers it if needed.`);
      expect((await line()).map((l) => l.status)).toEqual(['cancelled', 'approved']);
      expect(await bonusCosts()).toHaveLength(1);
      const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'referral.reward_updated', entityId: ids.ref2 }, orderBy: { createdAt: 'asc' }, select: { metadataJson: true } }));
      expect(audits.map((a) => JSON.parse(a.metadataJson!))).toEqual([
        { before: 'pending', rewardStatus: 'paid', amountInr: 50000, payMonth: paid.payMonth, paidVia: 'payroll' },
        { before: 'paid', rewardStatus: 'paid', amountInr: 50000, payMonth: null, paidVia: 'payroll' },
        { before: 'paid', rewardStatus: 'approved', undonePaidVia: 'payroll' },
        { before: 'approved', rewardStatus: 'paid', amountInr: 50000, payMonth: expect.any(String), paidVia: 'payroll' },
      ]);
    });

    it('a referrer with no employee record cannot be paid through payroll (409); paid outside payroll posts the cost at once and undoes while the quarter is open (285, 283)', async () => {
      const r = await inA((tx) => tx.referral.findFirstOrThrow({ where: { referrerUserId: users.manager } }));
      await hire(r.id, new Date('2025-01-06T00:00:00+05:30'));
      expect((await api('hr', 'get', '/referrals').expect(200)).body.find((x: { id: string }) => x.id === r.id)).toMatchObject({ bonusDue: 'due' });
      expect((await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid' }).expect(409)).body.message).toMatch(/no employee record/);
      expect(await sudo((t) => t.oneTimePay.count({ where: { organizationId: org.A.id, sourceRef: `referral:${r.id}` } }))).toBe(0);
      expect((await inA((tx) => tx.referral.findUniqueOrThrow({ where: { id: r.id } }))).rewardStatus).not.toBe('paid');

      // Answer 285: Paid outside payroll: no pay line, the cost is posted at once (this month, India time), audited.
      const before = (await api('hr', 'get', '/referrals').expect(200)).body.find((x: { id: string }) => x.id === r.id);
      expect(before).toMatchObject({ referrerIsEmployee: false, paidVia: null });
      const bonus = before.bonusInr as number;
      await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid', paidVia: 'cash' }).expect(400);
      await api('actingRecruiter', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid', paidVia: 'outside' }).expect(403);
      await api('hrB', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid', paidVia: 'outside' }).expect(404);
      expect((await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid', paidVia: 'outside' }).expect(200)).body).toEqual({ id: r.id, rewardStatus: 'paid', paidVia: 'outside' });
      await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid', paidVia: 'outside' }).expect(200); // a repeat posts no second cost
      expect(await sudo((t) => t.oneTimePay.count({ where: { organizationId: org.A.id, sourceRef: `referral:${r.id}` } }))).toBe(0);
      const outsideCosts = async () => (await api('hr', 'get', '/hiring/costs').expect(200)).body.filter((c: { sourceRef: string | null }) => c.sourceRef === `referral:${r.id}`);
      const [posted] = await outsideCosts();
      expect(await outsideCosts()).toHaveLength(1);
      expect(posted).toMatchObject({ origin: 'outside_payroll', costType: 'referral_bonus', amount: bonus, source: 'Referral: Vikram Reddy', jobTitle: 'Senior QA Engineer' });
      expect(posted.period.slice(0, 7)).toBe(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date()));
      await api('hr', 'delete', `/hiring/costs/${posted.id}`).expect(409); // posted automatically: changed only by undo
      expect((await api('hr', 'get', '/referrals').expect(200)).body.find((x: { id: string }) => x.id === r.id)).toMatchObject({ bonusDue: 'paid', paidVia: 'outside' });
      // Answer 283: Undo paid while the quarter is open removes the cost; the bonus is due again.
      await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'approved' }).expect(200);
      expect(await outsideCosts()).toEqual([]);
      expect((await api('hr', 'get', '/referrals').expect(200)).body.find((x: { id: string }) => x.id === r.id)).toMatchObject({ bonusDue: 'due', paidVia: null });
      // HR may choose outside payroll for anyone; once the cost's quarter has closed, undo is refused with the reason.
      await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'paid', paidVia: 'outside' }).expect(200);
      await inA((tx) => tx.recruitingCost.updateMany({ where: { sourceRef: `referral:${r.id}` }, data: { period: new Date(lastQuarterMonth) } }));
      expect((await api('hr', 'patch', `/referrals/${r.id}/reward`).send({ rewardStatus: 'approved' }).expect(409)).body.message).toMatch(/quarter that is closed, so it cannot be undone here/);
      expect(await outsideCosts()).toHaveLength(1);
      const audits = await inA((tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: 'referral.reward_updated', entityId: r.id }, orderBy: { createdAt: 'asc' }, select: { metadataJson: true } }));
      expect(audits.map((a) => JSON.parse(a.metadataJson!))).toEqual([
        { before: 'pending', rewardStatus: 'paid', amountInr: bonus, payMonth: null, paidVia: 'outside' },
        { before: 'paid', rewardStatus: 'paid', amountInr: bonus, payMonth: null, paidVia: 'outside' },
        { before: 'paid', rewardStatus: 'approved', undonePaidVia: 'outside' },
        { before: 'approved', rewardStatus: 'paid', amountInr: bonus, payMonth: null, paidVia: 'outside' },
      ]);
      // Back to not hired and unpaid for the next test.
      await inA(async (tx) => {
        await tx.offer.deleteMany({ where: { pipelineEntryId: r.entryId } });
        await tx.recruitingCost.deleteMany({ where: { sourceRef: `referral:${r.id}` } });
        await tx.referral.update({ where: { id: r.id }, data: { rewardStatus: 'pending' } });
      });
    });

    it('a rejected referral reads Not selected', async () => {
      await inA(async (tx) => {
        const r = await tx.referral.findFirstOrThrow({ where: { referrerUserId: users.manager } });
        await tx.pipelineEntry.update({ where: { id: r.entryId }, data: { rejected: true } });
      });
      expect((await api('manager', 'get', '/referrals/mine').expect(200)).body[0]).toMatchObject({ stage: 'Not selected', bonusDue: 'none' });
    });
  });

  it('quarterIst is the calendar quarter in India time', () => {
    expect(quarterIst(new Date('2026-12-31T19:00:00Z'))).toEqual({ from: '2027-01-01', to: '2027-03-31' }); // 1 Jan 00:30 IST
    expect(quarterIst(new Date('2026-11-09T06:00:00Z'))).toEqual({ from: '2026-10-01', to: '2026-12-31' });
    expect(quarterIst(new Date('2028-02-29T06:00:00Z'))).toEqual({ from: '2028-01-01', to: '2028-03-31' });
  });
});
