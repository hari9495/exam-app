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
import { addDays } from '../src/lifecycle/journey-rules';
import { LastDayService } from '../src/lifecycle/last-day.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// HIR-05 candidate record end to end (docs/yukthix/hiring-design-map.md): a recruiter reads and edits; a hiring manager
// (ats.candidate.view) reads without contact details; merge and erase need the data-rights key and are audited; erase
// and the retention sweep respect legal hold; the ex-employee match (People's person match) is shown only to people
// who may see the employee, at the level their keys allow; an employee gets 403, another company 404; writes are refused
// while acting for someone else; bad input is 400.

jest.setTimeout(180_000);

describe('Hiring HIR-05 candidate record', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let lastDay: LastDayService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'admin2' | 'recruiter' | 'rights' | 'hm' | 'emp' | 'peopleRecruiter' | 'hrExit' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  /** Expects `status` and shows the API's message when it differs. */
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const candidate = (name: string, extra: Record<string, unknown> = {}) =>
    inA(async (tx) => (await tx.candidate.create({ data: { organizationId: org.A.id, name, email: `${name.toLowerCase().replace(/\W+/g, '.')}-${run}@x.test`, portalToken: randomUUID(), ...extra } })).id);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    lastDay = moduleRef.get(LastDayService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `hir05-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `HIR05 Org ${k}`, slug: `hir05-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['admin2', 'A', 'recruiter', null],
      ['recruiter', 'A', 'panel', ['ats.candidate.manage', 'ats.job.manage']],
      ['rights', 'A', 'panel', ['ats.candidate.manage', 'ats.candidate.data_rights']],
      ['hm', 'A', 'panel', ['ats.candidate.view']],
      ['emp', 'A', 'panel', []],
      ['peopleRecruiter', 'A', 'panel', ['ats.candidate.manage', 'employee.profile.view']],
      ['hrExit', 'A', 'panel', ['ats.candidate.manage', 'ats.candidate.data_rights', 'employee.profile.view', 'lifecycle.exit.view', 'lifecycle.exit.manage', 'lifecycle.exit.confidential.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@hir05-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@hir05-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Acting for a recruiter whose role (the company's override) holds every key used here, so only the acting rule can
    // refuse (an impersonation token carries the role's keys, not a permission profile).
    await inA((tx) => tx.orgRolePermission.create({ data: { organizationId: org.A.id, role: 'recruiter', permissionsJson: JSON.stringify(['candidate:manage', 'candidate:view', 'candidate:data_rights', 'results:view', 'employee.profile.view', 'lifecycle.exit.view', 'lifecycle.exit.manage', 'lifecycle.exit.confidential.view']) } }));
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.admin2}`).expect(200)).body.accessToken;

    ids.priya = await candidate('Priya Raman', { phone: '98450 12345' });
    ids.dup = await candidate('Priya R', { phone: '+91 98450-12345' });
    ids.job = (await api('admin', 'post', '/jobs').send({ title: 'Accountant' }).expect(201)).body.id;
    await api('admin', 'post', `/jobs/${ids.job}/entries`).send({ candidateId: ids.priya }).expect(201);

    // People: Fatima worked here and left (absconding: rehire is off until HR says otherwise).
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'QA Engineer', code: 'QAE' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    ids.fatimaEmail = `fatima-${run}@mailbox.in`;
    ids.fatimaEmp = (await api('admin', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Fatima', familyName: run, employeeCode: 'KF-100', joinedOn: addDays(today, -30), workEmail: ids.fatimaEmail, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(want(201))).body.id;
    const k = (await api('admin', 'post', '/lifecycle/exits').send({ employeeId: ids.fatimaEmp, exitType: 'absconding', lwd: addDays(today, -10), reasonText: 'Stopped coming' }).expect(want(201))).body;
    ids.exit = k.id;
    await lastDay.sweepCase(org.A.id, k.id, new Date());
    ids.fatima = await candidate('Fatima Shaikh', { email: ids.fatimaEmail });
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

  it('a recruiter reads the full record and edits the candidate', async () => {
    const v = (await api('recruiter', 'get', `/hiring/candidates/${ids.priya}`).expect(200)).body;
    expect(v.candidate).toMatchObject({ name: 'Priya Raman', email: `priya.raman-${run}@x.test`, phone: '98450 12345' });
    expect(v.retention).toMatchObject({ months: 12 });
    expect(v.applications).toHaveLength(1);
    expect(v.exEmployee).toBeNull();
    await api('recruiter', 'patch', `/candidates/${ids.priya}`).send({ phone: '98450 99999' }).expect(200);
    expect((await api('recruiter', 'get', `/hiring/candidates/${ids.priya}`).expect(200)).body.candidate.phone).toBe('98450 99999');
    await api('recruiter', 'patch', `/candidates/${ids.priya}`).send({ phone: '98450 12345' }).expect(200);
  });

  it('a hiring manager (ats.candidate.view) reads the hiring facts only, and cannot write', async () => {
    const v = (await api('hm', 'get', `/hiring/candidates/${ids.priya}`).expect(200)).body;
    expect(v.candidate).toMatchObject({ name: 'Priya Raman', email: null, phone: null, phoneE164: null });
    expect(v).toMatchObject({ consents: [], lists: [], merges: [], retention: null, messages: { emails: [], sms: 0, whatsapp: 0 } });
    expect(v.applications).toHaveLength(1);
    await api('hm', 'patch', `/candidates/${ids.priya}`).send({ phone: '1' }).expect(403);
    await api('hm', 'put', `/hiring/candidates/${ids.priya}/legal-hold`).send({ on: true, reason: 'Case 1' }).expect(403);
    await api('hm', 'get', '/hiring/duplicates').expect(403);
  });

  it('an employee with no candidate key gets 403; another company gets 404', async () => {
    await api('emp', 'get', `/hiring/candidates/${ids.priya}`).expect(403);
    await api('emp', 'post', '/hiring/data-requests/lookup').send({ email: `priya.raman-${run}@x.test` }).expect(403);
    await api('adminB', 'get', `/hiring/candidates/${ids.priya}`).expect(404);
    await api('adminB', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: ids.dup }).expect(404);
    await api('adminB', 'post', `/candidates/${ids.priya}/erase`).expect(404);
    expect((await api('adminB', 'post', '/hiring/data-requests/lookup').send({ email: `priya.raman-${run}@x.test` }).expect(200)).body).toEqual({ match: null });
  });

  it('bad input is refused with 400', async () => {
    await api('rights', 'get', '/hiring/candidates/not-a-uuid').expect(400);
    await api('rights', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: 'nope' }).expect(400);
    await api('rights', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: ids.dup, name: 'both' }).expect(400);
    await api('rights', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: ids.priya }).expect(400);
    await api('rights', 'post', '/candidates/not-a-uuid/erase').expect(400);
    await api('rights', 'post', '/hiring/data-requests/lookup').send({ email: 'not an email' }).expect(400);
    await api('rights', 'put', `/hiring/candidates/${ids.priya}/legal-hold`).send({ on: true, reason: 'x' }).expect(400);
  });

  it('writes are refused while acting for someone else; reads still work', async () => {
    await api('acting', 'get', `/hiring/candidates/${ids.priya}`).expect(200);
    for (const [m, p, body] of [
      ['post', `/hiring/candidates/${ids.priya}/merge`, { mergedId: ids.dup }],
      ['post', `/candidates/${ids.priya}/erase`, undefined],
      ['put', `/hiring/candidates/${ids.priya}/legal-hold`, { on: true, reason: 'Case 12' }],
      ['patch', `/candidates/${ids.priya}`, { phone: '1' }],
      ['post', '/hiring/retention/run', { dryRun: false }],
    ] as const) {
      const r = api('acting', m, p);
      expect((await (body ? r.send(body) : r).expect(403)).body.message).toBe('Not available while acting for someone else');
    }
    await api('acting', 'post', '/hiring/retention/run').send({ dryRun: true }).expect(200);
    const export_ = await api('acting', 'get', `/candidates/${ids.priya}/export`).expect(403);
    expect(export_.body.message).toBe('Not available while acting for someone else');
  });

  it('merge needs the data-rights key, is audited and shows on the record', async () => {
    await api('recruiter', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: ids.dup }).expect(403);
    expect(await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: ids.dup }, select: { mergedIntoId: true } }))).toEqual({ mergedIntoId: null });
    const dupes = (await api('rights', 'get', '/hiring/duplicates').expect(200)).body as { a: { id: string }; b: { id: string } }[];
    expect(dupes.some((p) => [p.a.id, p.b.id].sort().join() === [ids.priya, ids.dup].sort().join())).toBe(true);
    const r = (await api('rights', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: ids.dup, phone: 'merged' }).expect(200)).body;
    expect(r.choices).toEqual({ name: 'kept', phone: 'merged', resume: 'kept' });
    expect((await api('rights', 'get', `/hiring/candidates/${ids.dup}`).expect(200)).body).toEqual({ mergedIntoId: ids.priya });
    const v = (await api('rights', 'get', `/hiring/candidates/${ids.priya}`).expect(200)).body;
    expect(v.candidate.phone).toBe('+91 98450-12345');
    expect(v.merges).toEqual([expect.objectContaining({ keptId: ids.priya, mergedId: ids.dup })]);
    const audit = await inA((tx) => tx.auditLog.findFirst({ where: { action: 'ats.candidate.merged', entityId: ids.priya } }));
    expect(audit).toMatchObject({ actorUserId: users.rights });
    await api('rights', 'post', `/hiring/candidates/${ids.priya}/merge`).send({ mergedId: ids.dup }).expect(409);
  });

  it('erase needs the data-rights key, respects legal hold, is audited, and the sweep skips the held', async () => {
    ids.held = await candidate('Old Held', { createdAt: new Date(Date.now() - 400 * 86_400_000) });
    ids.gone = await candidate('Asks Erasure');
    await api('recruiter', 'post', `/candidates/${ids.gone}/erase`).expect(403);
    await api('rights', 'put', `/hiring/candidates/${ids.held}/legal-hold`).send({ on: true, reason: 'Labour court case 12/2026' }).expect(200);
    expect((await api('rights', 'post', `/candidates/${ids.held}/erase`).expect(409)).body.message).toMatch(/legal hold/);
    const dry = (await api('rights', 'post', '/hiring/retention/run').send({ dryRun: true }).expect(200)).body;
    expect(dry.plan).toEqual(expect.arrayContaining([{ candidateId: ids.held, action: 'skipped_hold' }]));

    // A data request: found by email (POST body), exported, then erased.
    const found = (await api('rights', 'post', '/hiring/data-requests/lookup').send({ email: `ASKS.ERASURE-${run}@x.test` }).expect(200)).body;
    expect(found).toEqual({ match: { id: ids.gone, name: 'Asks Erasure', email: `asks.erasure-${run}@x.test`, stage: 'new', onHold: false, erased: false } });
    expect((await api('rights', 'get', `/candidates/${ids.gone}/export`).expect(200)).body.candidate).toMatchObject({ name: 'Asks Erasure' });
    await api('rights', 'post', `/candidates/${ids.gone}/erase`).expect(201);
    const after = await inA((tx) => tx.candidate.findUniqueOrThrow({ where: { id: ids.gone } }));
    expect(after).toMatchObject({ name: 'Redacted', erasedAt: expect.any(Date) });
    expect(await inA((tx) => tx.auditLog.findFirst({ where: { action: 'candidate.erased', entityId: ids.gone } }))).toMatchObject({ actorUserId: users.rights });
    expect((await api('rights', 'get', `/hiring/candidates/${ids.gone}`).expect(200)).body.candidate.erasedAt).toBeTruthy();
    expect((await api('rights', 'post', '/hiring/data-requests/lookup').send({ email: `asks.erasure-${run}@x.test` }).expect(200)).body).toEqual({ match: null });
  });

  describe('ex-employee match (People person match, YX-ATS-33)', () => {
    it('nobody without a People key sees it, not even the flag', async () => {
      expect((await api('recruiter', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toBeNull();
      expect((await api('rights', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toBeNull();
      expect((await api('hm', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toBeNull();
    });

    it('employee.profile.view: the flag only, no exit details', async () => {
      expect((await api('peopleRecruiter', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toEqual({ level: 'flag', exitDate: null, exitType: null, rehireEligible: null, rehireReason: null, exitCaseId: null, version: null });
    });

    it('HR with the exit keys: exit date, type and rehire eligibility, and may clear the flag on the exit record', async () => {
      const ex = (await api('hrExit', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee;
      expect(ex).toMatchObject({ level: 'rehire', exitType: 'Absconding', rehireEligible: false, exitCaseId: ids.exit, version: expect.any(Number) });
      expect(ex.exitDate.slice(0, 10)).toBe(addDays(today, -10));
      await api('hrExit', 'put', `/lifecycle/exits/${ids.exit}/hr`).send({ version: ex.version, rehireEligible: true, rehireReason: 'Was on medical leave; HR checked' }).expect(200);
      expect((await api('hrExit', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toMatchObject({ rehireEligible: true, rehireReason: 'Was on medical leave; HR checked' });
      await api('hrExit', 'put', `/lifecycle/exits/${ids.exit}/hr`).send({ version: ex.version, rehireEligible: false }).expect(409);
    });

    it('never while acting for someone else; never for another company', async () => {
      // admin2 holds every key: as themself they see the match, acted for they do not.
      expect((await api('admin2', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toMatchObject({ level: 'rehire' });
      expect((await api('acting', 'get', `/hiring/candidates/${ids.fatima}`).expect(200)).body.exEmployee).toBeNull();
      await api('adminB', 'get', `/hiring/candidates/${ids.fatima}`).expect(404);
    });

    it('a current employee is not an ex-employee', async () => {
      const email = `still-${run}@mailbox.in`;
      await api('admin', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Still', familyName: run, employeeCode: 'KF-101', joinedOn: addDays(today, -30), workEmail: email, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null } }).expect(201);
      const c = await candidate('Still Here', { email });
      expect((await api('hrExit', 'get', `/hiring/candidates/${c}`).expect(200)).body.exEmployee).toBeNull();
    });
  });
});
