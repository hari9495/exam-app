import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { InternalApplicationsService } from '../src/internal-applications/internal-applications.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Answer 2761 end to end against the real database: with hiring.internal.manager_release on (off by default), applying
// for an internal job asks the current manager to release the person through the approvals engine; no offer until they
// agree; no answer in 5 working days hands it to HR (hourly job). Off: the manager is only told, as before.

jest.setTimeout(120_000);

describe('Answer 2761: the manager releases an internal applicant', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let internal: InternalApplicationsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'hrAdm' | 'mgr' | 'emp' | 'peer' | 'adminB';
  const token = {} as Record<Who, string>;
  const users = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const owner = new PrismaClient({ datasources: { db: { url: process.env.MIGRATION_DATABASE_URL } } });
  const sudo = <T>(fn: (t: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]) => Promise<T>) => owner.$transaction(async (t) => (await t.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`, fn(t)));
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const NOTE = 'I ran the QA automation on Line 3 and want to grow it company-wide.';
  const OFFER = { compensation: '₹9,60,000 a year', startDate: '2027-01-04', expiresAt: '2026-12-31', subject: 'Offer', body: 'Welcome' };
  const apply = async (who: Who, job: string) => (await api(who, 'post', '/internal-applications').send({ jobId: ids[job], note: NOTE }).expect(201)).body.id as string;
  const row = (entryId: string) => inA((tx) => tx.internalApplication.findUniqueOrThrow({ where: { entryId } }));
  const openTasks = async (entryId: string) => {
    const r = await row(entryId);
    return inA((tx) => tx.wfTask.findMany({ where: { requestId: r.releaseWfRequestId!, status: 'open' }, orderBy: { createdAt: 'asc' } }));
  };
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject') => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(decision === 'reject' ? { reason: 'Needed on Line 3 until March' } : {}) });
  const told = (who: Who) => inA((tx) => tx.userNotification.count({ where: { recipientUserId: users[who], type: 'hiring.internal.applied' } }));
  const setRelease = (who: Who, value: string) => api(who, 'put', '/org/settings').send({ key: 'hiring.internal.manager_release', value, scopeType: 'tenant' });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    internal = moduleRef.get(InternalApplicationsService);

    planId = (await prisma.plan.create({ data: { name: `rel-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `REL Org ${k}`, slug: `rel-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string][] = [
      ['admin', 'A', 'org_admin'],
      ['hrAdm', 'A', 'panel'],
      ['mgr', 'A', 'panel'],
      ['emp', 'A', 'panel'],
      ['peer', 'A', 'panel'],
      ['adminB', 'B', 'org_admin'],
    ];
    for (const [who, k, role] of roster) {
      const o = org[k].id;
      const permissionProfileId = who === 'hrAdm' ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `hr-admin-${run}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@rel-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@rel-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Demo Foods', shortName: `RF-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'QA Engineer', code: 'QAE' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const person = async (who: Who, givenName: string, managerEmployeeId: string | null) => {
      const id = (await api('admin', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Release tests', givenName, familyName: `Test ${run}`, employeeCode: `${who.toUpperCase()}-${run}`, joinedOn: '2023-04-01', assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId } }).expect(201)).body.id as string;
      await sudo((t) => t.employee.update({ where: { id }, data: { userId: users[who] } }));
      return id;
    };
    ids.mgrEmp = await person('mgr', 'Divya', null);
    ids.empEmp = await person('emp', 'Arjun', ids.mgrEmp);
    ids.peerEmp = await person('peer', 'Kiran', ids.mgrEmp);
    for (const j of ['j0', 'j1', 'j2', 'j3', 'j4']) ids[j] = (await api('admin', 'post', '/jobs').send({ title: `Senior QA Engineer ${j}`, location: 'Chennai' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await owner.$disconnect();
    await app.close();
  });

  it('off by default: the manager is told, nothing is asked, and an offer can be made', async () => {
    expect((await api('emp', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ eligible: true, managerRelease: false });
    const entry = await apply('emp', 'j0');
    expect(await row(entry)).toMatchObject({ releaseStatus: null, releaseWfRequestId: null, managerToldAt: expect.any(Date) });
    expect(await told('mgr')).toBe(1);
    await api('admin', 'post', `/pipeline/entries/${entry}/offers`).send(OFFER).expect(201);
  });

  it('the setting: only the listed values, only who manages settings', async () => {
    await setRelease('admin', 'sometimes').expect(400);
    await setRelease('emp', 'on').expect(403);
    await setRelease('admin', 'on').expect(200);
    expect((await api('emp', 'get', '/internal-applications/eligibility').expect(200)).body).toMatchObject({ managerRelease: true });
  });

  it('on: applying asks the manager through the approvals engine; no offer until they release; then the offer goes ahead', async () => {
    ids.e1 = await apply('emp', 'j1');
    const r = await row(ids.e1);
    expect(r).toMatchObject({ releaseStatus: 'pending', releaseWfRequestId: expect.any(String), releaseAskedAt: expect.any(Date), releaseHrAt: null, managerUserId: users.mgr });
    const wf = await inA((tx) => tx.wfRequest.findUniqueOrThrow({ where: { id: r.releaseWfRequestId! } }));
    expect(wf).toMatchObject({ requestType: 'hiring.internal_release', status: 'pending', requesterUserId: users.emp, subjectId: r.id });
    // Asked, not told: no "applied" notice; the approval reaches the manager's inbox.
    expect(await told('mgr')).toBe(1);
    const tasks = await openTasks(ids.e1);
    expect(tasks.map((t) => t.assigneeUserId)).toEqual([users.mgr]);
    // Answer 2841: My applications says it is waiting for the manager; once released, it no longer does.
    const mine = async () => ((await api('emp', 'get', '/internal-applications/mine').expect(200)).body as { entryId: string; waitingForManager: boolean }[]).find((a) => a.entryId === ids.e1)!;
    expect((await mine()).waitingForManager).toBe(true);
    // No offer while it waits.
    expect((await api('admin', 'post', `/pipeline/entries/${ids.e1}/offers`).send(OFFER).expect(409)).body.message).toMatch(/current manager has not released them yet/);
    // Only the manager decides: not the applicant, not someone else, not another company.
    await decide('emp', tasks[0]!.id, 'approve').expect((x) => expect([403, 404]).toContain(x.status));
    await decide('peer', tasks[0]!.id, 'approve').expect((x) => expect([403, 404]).toContain(x.status));
    await decide('adminB', tasks[0]!.id, 'approve').expect(404);
    expect((await row(ids.e1)).releaseStatus).toBe('pending');
    await decide('mgr', tasks[0]!.id, 'approve').expect((x) => expect([200, 201]).toContain(x.status));
    expect((await row(ids.e1)).releaseStatus).toBe('approved');
    expect((await mine()).waitingForManager).toBe(false);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'internal_application.released', entityId: r.id } }))).toBe(1);
    await api('admin', 'post', `/pipeline/entries/${ids.e1}/offers`).send(OFFER).expect(201);
  });

  it('negative: the manager refuses; no offer can be made', async () => {
    const entry = await apply('emp', 'j2');
    const [task] = await openTasks(entry);
    await decide('mgr', task!.id, 'reject').expect((x) => expect([200, 201]).toContain(x.status));
    expect((await row(entry)).releaseStatus).toBe('refused');
    // Negative (2841): a refused release is not 'waiting' any more.
    expect(((await api('emp', 'get', '/internal-applications/mine').expect(200)).body as { entryId: string; waitingForManager: boolean }[]).find((a) => a.entryId === entry)!.waitingForManager).toBe(false);
    expect((await api('admin', 'post', `/pipeline/entries/${entry}/offers`).send(OFFER).expect(409)).body.message).toBe('Their current manager did not release them for this job, so no offer can be made.');
  });

  it('no answer in 5 working days: the hourly job hands it to HR (not the manager’s manager); once only; HR decides', async () => {
    ids.late = await apply('emp', 'j3');
    ids.fresh = await apply('peer', 'j3');
    // Nothing is due yet.
    expect(await internal.releaseHandOver(new Date(), [org.A.id])).toBe(0);
    // Asked 14 days ago: well past 5 working days, whatever the holidays.
    await inA((tx) => tx.internalApplication.update({ where: { entryId: ids.late }, data: { releaseAskedAt: new Date(Date.now() - 14 * 86_400_000) } }));
    expect(await internal.releaseHandOver(new Date(), [org.A.id])).toBe(1);
    expect((await openTasks(ids.late)).map((t) => t.assigneeUserId).sort()).toEqual([users.mgr, users.hrAdm].sort());
    expect((await row(ids.late)).releaseHrAt).toEqual(expect.any(Date));
    expect((await openTasks(ids.fresh)).map((t) => t.assigneeUserId)).toEqual([users.mgr]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'internal_application.release_to_hr' } }))).toBe(1);
    // A rerun does nothing more; another company has nothing to do.
    expect(await internal.releaseHandOver(new Date(), [org.A.id])).toBe(0);
    expect(await internal.releaseHandOver(new Date(), [org.B.id])).toBe(0);
    expect((await openTasks(ids.late)).length).toBe(2);
    const hrTask = (await openTasks(ids.late)).find((t) => t.assigneeUserId === users.hrAdm)!;
    await decide('hrAdm', hrTask.id, 'approve').expect((x) => expect([200, 201]).toContain(x.status));
    expect((await row(ids.late)).releaseStatus).toBe('approved');
    await api('admin', 'post', `/pipeline/entries/${ids.late}/offers`).send(OFFER).expect(201);
  });

  it('turning it off again: new applications are told, not asked; one still waiting keeps waiting', async () => {
    await setRelease('admin', 'off').expect(200);
    const entry = await apply('emp', 'j4');
    expect(await row(entry)).toMatchObject({ releaseStatus: null, releaseWfRequestId: null });
    expect(await told('mgr')).toBe(2);
    expect((await row(ids.fresh)).releaseStatus).toBe('pending');
    await api('admin', 'post', `/pipeline/entries/${ids.fresh}/offers`).send(OFFER).expect(409);
  });

  it('row-level security: another company sees no release', async () => {
    const seen = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.internalApplication.findMany({ where: { releaseStatus: { not: null } } }));
    expect(seen).toEqual([]);
  });
});
