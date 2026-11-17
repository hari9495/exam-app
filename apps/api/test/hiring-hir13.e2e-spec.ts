import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { LOGIN_PROTECTION_REDIS } from '../src/auth/login-protection.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-13 internal jobs end to end (docs/yukthix/hiring-design-map.md, founder decision 6 and answer 226): which jobs an
// employee sees, who may apply and when (past probation, months in the current role, never while serving notice or
// without an employee record; each rule a company setting), applying with a note and an optional PDF résumé, the
// manager told (never asked) on apply or at the offer, the job's "Referrals & internal" switches, and the negatives:
// another company (404), acting for someone else (403), the job's own hiring manager, repeats, bad input, RLS.

jest.setTimeout(120_000);

describe('Hiring HIR-13 internal jobs', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'hr' | 'mgr' | 'emp' | 'prob' | 'fresh' | 'noRecord' | 'hrB' | 'empB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  const sudo = <T>(fn: (t: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>) => owner.$transaction(async (t) => (await t.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`, fn(t)));
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const setSetting = (key: string, value: string) =>
    inA(async (tx) => {
      const where = { organizationId: org.A.id, key, scopeType: 'tenant', scopeId: org.A.id };
      const found = await tx.setting.findFirst({ where });
      return found ? tx.setting.update({ where: { id: found.id }, data: { value } }) : tx.setting.create({ data: { ...where, value } });
    });
  const istToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const daysAgo = (n: number) => new Date(Date.parse(`${istToday}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  const NOTE = 'I ran the QA automation on Line 3 and want to grow it company-wide.';
  const told = (who: Who) => inA((tx) => tx.userNotification.count({ where: { recipientUserId: users[who]!, type: 'hiring.internal.applied' } }));

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

    planId = (await prisma.plan.create({ data: { name: `hir13-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR13 Org ${k}`, slug: `hir13-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string][] = [
      ['hr', 'A', 'org_admin'],
      ['mgr', 'A', 'panel'],
      ['emp', 'A', 'panel'],
      ['prob', 'A', 'panel'],
      ['fresh', 'A', 'panel'],
      ['noRecord', 'A', 'panel'],
      ['hrB', 'B', 'org_admin'],
      ['empB', 'B', 'panel'],
    ];
    for (const [who, k, role] of roster) {
      const o = org[k].id;
      // Answer 511 took the interviewer keys off the default employee role: the manager is given one, so the hiding is
      // still tested against someone who could otherwise read applications.
      const permissionProfileId = who === 'mgr' ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `interviewer-${run}`, permissionsJson: JSON.stringify(['org:view', 'results:view']) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir13-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir13-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    token.acting = (await api('hr', 'post', `/auth/impersonate/${users.emp}`).expect(200)).body.accessToken;

    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Demo Foods', shortName: `DF-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'QA Engineer', code: 'QAE' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    // People: Divya manages Arjun (confirmed, in the role since 2024), a joiner on probation, and a recent joiner.
    const person = async (who: Who, givenName: string, status: 'confirmed' | 'probation', joinedOn: string, managerEmployeeId: string | null) => {
      const id = (await api('hr', 'post', '/people/employees').send({ legalEntityId: ids.entity, status, reason: 'Joined', overrideReason: 'HIR-13 tests', givenName, familyName: `Test ${run}`, employeeCode: `${who.toUpperCase()}-${run}`, joinedOn, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId } }).expect(201)).body.id as string;
      await sudo((t) => t.employee.update({ where: { id }, data: { userId: users[who]! } }));
      return id;
    };
    ids.mgrEmp = await person('mgr', 'Divya', 'confirmed', '2023-04-01', null);
    ids.empEmp = await person('emp', 'Arjun', 'confirmed', '2024-04-01', ids.mgrEmp);
    ids.probEmp = await person('prob', 'Kiran', 'probation', daysAgo(20), ids.mgrEmp);
    ids.freshEmp = await person('fresh', 'Meena', 'confirmed', daysAgo(60), ids.mgrEmp);

    const job = async (who: Who, title: string) => (await api(who, 'post', '/jobs').send({ title, location: 'Chennai' }).expect(201)).body.id as string;
    ids.job = await job('hr', 'Senior QA Engineer');
    ids.offJob = await job('hr', 'Confidential replacement');
    ids.closedJob = await job('hr', 'Old role');
    ids.hmJob = await job('hr', 'QA Lead');
    ids.jobB = await job('hrB', 'Accountant');
    await inA(async (tx) => {
      await tx.job.update({ where: { id: ids.offJob }, data: { internalOpen: false } });
      await tx.job.update({ where: { id: ids.closedJob }, data: { status: 'closed' } });
      await tx.job.update({ where: { id: ids.hmJob }, data: { hiringManagerId: users.emp! } });
    });
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await owner.$disconnect();
    await app.close();
  });

  it('an employee sees only the open jobs on Internal jobs, never their own hiring job or another company’s', async () => {
    const titles = ((await api('emp', 'get', '/internal-applications/jobs').expect(200)).body as { title: string; postedAt: string }[]).map((j) => j.title);
    expect(titles).toEqual(['Senior QA Engineer']);
    expect(((await api('hrB', 'get', '/internal-applications/jobs').expect(200)).body as { title: string }[]).map((j) => j.title)).toEqual(['Accountant']);
    await request(server()).get('/api/v1/internal-applications/jobs').expect(401);
  });

  it('eligibility follows the company rules (defaults: past probation, 12 months in the role)', async () => {
    expect((await api('emp', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ eligible: true, managerName: `Divya Test ${run}`, tellManager: 'on_apply', rules: { afterProbation: true, monthsInRole: 12 } });
    expect((await api('prob', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ eligible: false, reason: 'probation' });
    expect((await api('fresh', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ eligible: false, reason: 'months', opensOn: expect.any(String) });
    expect((await api('noRecord', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ eligible: false, reason: 'not_employee', managerName: null });
  });

  it('an eligible employee applies: the entry, the note for the hiring team, the record and the manager told (not asked)', async () => {
    const { id } = (await api('emp', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE, resumeBase64: Buffer.from('%PDF-1.4 small').toString('base64') }).expect(201)).body;
    ids.entry = id;
    expect((await api('emp', 'get', '/internal-applications/mine').expect(200)).body).toEqual([expect.objectContaining({ entryId: id, jobTitle: 'Senior QA Engineer', status: 'Applied' })]);
    const row = await inA((tx) => tx.internalApplication.findUniqueOrThrow({ where: { entryId: id } }));
    expect(row).toMatchObject({ applicantUserId: users.emp, employeeId: ids.empEmp, managerUserId: users.mgr, note: NOTE, managerToldAt: expect.any(Date) });
    expect(await inA((tx) => tx.pipelineFeedback.findFirst({ where: { entryId: id } }))).toMatchObject({ authorUserId: users.emp, note: `Why I am interested: ${NOTE}` });
    expect(await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id } }))).toMatchObject({ enteredVia: 'internal', referrerUserId: users.emp });
    expect(await told('mgr')).toBe(1);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'internal_application.submitted', entityId: id, actorUserId: users.emp } }))).toBe(1);
  });

  it('a repeat is 409 and nothing new is made', async () => {
    const res = await api('emp', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(409);
    expect(res.body.message).toBe('You have already applied for this job.');
    expect(await inA((tx) => tx.internalApplication.count({ where: { applicantUserId: users.emp! } }))).toBe(1);
    expect(await told('mgr')).toBe(1);
  });

  it('refusals: not on Internal jobs or another company (404), closed (409), own hiring job, not eligible and acting (403)', async () => {
    await api('emp', 'post', '/internal-applications').send({ jobId: ids.offJob, note: NOTE }).expect(404);
    await api('emp', 'post', '/internal-applications').send({ jobId: ids.jobB, note: NOTE }).expect(404);
    await api('empB', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(404);
    await api('emp', 'post', '/internal-applications').send({ jobId: ids.closedJob, note: NOTE }).expect(409);
    await api('emp', 'post', '/internal-applications').send({ jobId: ids.hmJob, note: NOTE }).expect(403);
    expect((await api('prob', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(403)).body.message).toMatch(/probation/);
    expect((await api('fresh', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(403)).body.message).toMatch(/12 months in your current role/);
    await api('noRecord', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(403);
    // Acting for someone else: refused on writes, whoever it is.
    expect((await api('acting', 'post', '/internal-applications').send({ jobId: ids.closedJob, note: NOTE }).expect(403)).body.message).toBe('Not available while acting for someone else');
    expect(await inA((tx) => tx.internalApplication.count())).toBe(1);
  });

  it('bad input is 400 and stores nothing', async () => {
    const bad: Record<string, unknown>[] = [
      { jobId: ids.job },
      { jobId: ids.job, note: '' },
      { jobId: 'not-a-uuid', note: NOTE },
      { jobId: ids.job, note: 'x'.repeat(2001) },
      { jobId: ids.job, note: NOTE, extra: true },
      { jobId: ids.job, note: NOTE, resumeBase64: 'not base64!' },
    ];
    for (const body of bad) await api('fresh', 'post', '/internal-applications').send(body).expect(400);
    // A résumé that is not a PDF (checked before the rules, so nothing is stored).
    expect((await api('emp', 'post', '/internal-applications').send({ jobId: ids.hmJob, note: NOTE, resumeBase64: Buffer.from('MZ not a pdf').toString('base64') }).expect(400)).body.message).toBe('The résumé must be a PDF file.');
    await api('emp', 'post', '/internal-applications').send({ jobId: ids.job, note: '   ' }).expect(400);
  });

  it('the rules are company settings: HR turns off the probation rule and the wait; the manager is told at the offer', async () => {
    await setSetting('hiring.internal.after_probation', 'off');
    await setSetting('hiring.internal.months_in_role', '0');
    await setSetting('hiring.internal.tell_manager', 'at_offer');
    expect((await api('fresh', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ eligible: true, tellManager: 'at_offer' });
    const { id } = (await api('prob', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(201)).body;
    expect(await told('mgr')).toBe(1); // not told on apply
    expect(await inA((tx) => tx.internalApplication.findUniqueOrThrow({ where: { entryId: id } }))).toMatchObject({ managerUserId: users.mgr, managerToldAt: null });
    // The first offer tells the manager, once.
    const offer = { compensation: '₹9,60,000 a year', startDate: '2027-01-04', expiresAt: '2026-12-31', subject: 'Offer', body: 'Welcome' };
    await api('hr', 'post', `/pipeline/entries/${id}/offers`).send(offer).expect(201);
    expect(await told('mgr')).toBe(2);
    expect(await inA((tx) => tx.internalApplication.findUniqueOrThrow({ where: { entryId: id } }))).toMatchObject({ managerToldAt: expect.any(Date) });
    const st = await inA(async (tx) => tx.offer.updateMany({ where: { pipelineEntryId: id }, data: { status: 'withdrawn' } }));
    expect(st.count).toBe(1);
    await api('hr', 'post', `/pipeline/entries/${id}/offers`).send(offer).expect(201);
    expect(await told('mgr')).toBe(2);
    expect((await api('prob', 'get', '/internal-applications/mine').expect(200)).body[0]).toMatchObject({ jobTitle: 'Senior QA Engineer' });
    // Serving notice is refused whatever the settings: unit tested (internal-applications.service.spec.ts); People's
    // status rows cannot be rewritten in a test (dated facts are append-only).
    for (const [k, v] of [['hiring.internal.after_probation', 'on'], ['hiring.internal.months_in_role', '12'], ['hiring.internal.tell_manager', 'on_apply']]) await setSetting(k!, v!);
  });

  it('the manager is told but sees nothing of the application: no candidate record, no notes, nothing in their own list', async () => {
    const entry = await inA((tx) => tx.pipelineEntry.findUniqueOrThrow({ where: { id: ids.entry } }));
    await api('mgr', 'get', `/hiring/candidates/${entry.candidateId}`).expect(403);
    // The manager holds the interviewer key (results:view), yet the application is hidden from them: no notes, not on the board.
    await api('mgr', 'get', `/entries/${ids.entry}/feedback`).expect(404);
    const board = (await api('mgr', 'get', `/hiring/jobs/${ids.job}/board`).expect(200)).body as { columns: Record<string, { entryId: string }[]> };
    expect(Object.values(board.columns).flat().map((r) => r.entryId)).not.toContain(ids.entry);
    // The hiring team still sees it, with the person's own words.
    const hrBoard = (await api('hr', 'get', `/hiring/jobs/${ids.job}/board`).expect(200)).body as { columns: Record<string, { entryId: string }[]> };
    expect(Object.values(hrBoard.columns).flat().map((r) => r.entryId)).toContain(ids.entry);
    expect(((await api('hr', 'get', `/entries/${ids.entry}/feedback`).expect(200)).body as { note: string }[])[0]!.note).toBe(`Why I am interested: ${NOTE}`);
    expect((await api('mgr', 'get', '/internal-applications/mine').expect(200)).body).toEqual([]);
    const note = (await inA((tx) => tx.userNotification.findFirstOrThrow({ where: { recipientUserId: users.mgr!, type: 'hiring.internal.applied' }, orderBy: { createdAt: 'asc' } }))).contextText;
    expect(note).toBe(`emp ${run} applied for the internal job Senior QA Engineer`);
  });

  it('answer 226: the job’s switches take the job off Internal jobs and off referrals; only the job key changes them', async () => {
    await api('emp', 'patch', `/jobs/${ids.job}`).send({ internalOpen: false }).expect(403);
    await api('hrB', 'patch', `/jobs/${ids.job}`).send({ internalOpen: false }).expect(404);
    await api('hr', 'patch', `/jobs/${ids.job}`).send({ internalOpen: 'no' }).expect(400);
    await api('hr', 'patch', `/jobs/${ids.job}`).send({ internalOpen: false, referralOpen: false }).expect(200);
    const job = (await api('hr', 'get', `/jobs/${ids.job}`).expect(200)).body;
    expect(job).toMatchObject({ internalOpen: false, referralOpen: false });
    expect((await api('emp', 'get', '/internal-applications/jobs').expect(200)).body).toEqual([]);
    expect(((await api('emp', 'get', '/referrals/jobs').expect(200)).body as { id: string }[]).map((j) => j.id)).not.toContain(ids.job);
    await api('emp', 'post', '/referrals').send({ jobId: ids.job, name: 'Ananya Iyer', email: `ananya-${run}@mailbox.in`, phone: '+919876543210', consentGiven: true }).expect(400);
    await api('fresh', 'post', '/internal-applications').send({ jobId: ids.job, note: NOTE }).expect(404);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'job.updated', entityId: ids.job } }))).toBeGreaterThan(0);
    await api('hr', 'patch', `/jobs/${ids.job}`).send({ internalOpen: true, referralOpen: true }).expect(200);
    expect(((await api('emp', 'get', '/referrals/jobs').expect(200)).body as { id: string }[]).map((j) => j.id)).toContain(ids.job);
  });

  it('row-level security: another company sees no internal application, even by id', async () => {
    const seen = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.internalApplication.findMany({ where: { entryId: ids.entry } }));
    expect(seen).toEqual([]);
    expect((await api('hrB', 'get', '/internal-applications/mine').expect(200)).body).toEqual([]);
  });
});
