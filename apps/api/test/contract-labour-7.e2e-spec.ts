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

// Contract labour CL-7 end to end (CLB-05, founder answer 637): HR with the onboarding key converts a deployed contract
// worker through the PPL-12 joiner flow (source contract_worker), pre-filled from the person and the deployment. The
// same person row is used. Until the joining day nothing changes for the worker; on joining the deployment ends the day
// before, the gate pass with it, the contract_worker role closes, and the UAN and ESIC IP are raised on the new
// employee. Refused: without the key 403, acting for someone else 403, another company 404, a worker not deployed or
// already joining 409, a joining day not after the deployment start 400.

jest.setTimeout(240_000);

describe('Contract labour CL-7: convert a contract worker to an employee', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'admin' | 'hr' | 'reader' | 'adminB' | 'acting';
  const token: Partial<Record<Who, string>> = {};
  const users: Partial<Record<Who, string>> = {};
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const want = (status: number) => (r: request.Response) => {
    if (r.status !== status) throw new Error(`${r.status}: ${JSON.stringify(r.body)}`);
  };
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const day = (s: string) => new Date(`${s}T00:00:00Z`);
  const path = (id: string) => `/lifecycle/joiners/from-contract-worker/${id}`;
  const body = (over: Record<string, unknown> = {}) => ({ joiningOn: today, legalEntityId: ids.entity, locationId: ids.hsr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, version: 1, ...over });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService).useValue(createFakeBlobStorage())
      .compile();
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

    planId = (await prisma.plan.create({ data: { name: `cl7-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `CL7 Org ${k} ${run}`, slug: `cl7-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Exclude<Who, 'acting'>, 'A' | 'B', string, string[] | null][] = [
      ['admin', 'A', 'org_admin', null],
      ['hr', 'A', 'panel', ['lifecycle.onboarding.manage', 'lifecycle.onboarding.view', 'employee.change.manage']],
      ['reader', 'A', 'panel', ['clra.contractor.view']],
      ['adminB', 'B', 'org_admin', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@cl7-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.hsr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Hosur plant', code: 'HSR', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Facilities', code: 'FAC', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Housekeeping associate', code: 'HK' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.agency = (await tx.agency.create({ data: { ...o, name: `Sri Lakshmi Facility Services ${run}`, portalToken: randomUUID(), contractLabour: true } })).id;
      // Two contract workers at Hosur: Murugan deployed since 60 days ago (with UAN and ESIC IP), Selvi still waiting for approval.
      const worker = async (given: string, status: string, n: number) => {
        const p = await tx.person.create({ data: { ...o, givenName: given, familyName: run } });
        const from = addDays(today, -60);
        const d = await tx.contractDeployment.create({
          data: { ...o, personId: p.id, agencyId: ids.agency, locationId: ids.hsr, skill: 'unskilled', dob: day('1995-04-01'), idLast4: `441${n}`, idHash: String(n).repeat(64), uan: n === 1 ? '100200300400' : null, esicIp: n === 1 ? '3100123456' : null, fromOn: day(from), status, gatePassNo: status === 'deployed' ? `GP-HSR-${n}` : null, gateValidTo: status === 'deployed' ? day(addDays(today, 200)) : null },
        });
        await tx.personRole.create({ data: { ...o, personId: p.id, roleType: 'contract_worker', sourceTable: 'contract_deployments', sourceId: d.id, startOn: day(from) } });
        return { person: p.id, deployment: d.id };
      };
      const m = await worker('Murugan', 'deployed', 1);
      ids.person = m.person;
      ids.dep = m.deployment;
      ids.pending = (await worker('Selvi', 'pending', 2)).deployment;
    });
    for (const [who, k] of [['admin', 'A'], ['hr', 'A'], ['reader', 'A'], ['adminB', 'B']] as const)
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@cl7-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    token.acting = (await api('admin', 'post', `/auth/impersonate/${users.hr}`).expect(200)).body.accessToken;
    // An onboarding checklist, as every company has before adding joiners.
    await api('admin', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'onboarding_standard' }).expect(201);
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

  it('the CLB-05 steps are pre-filled from the person and the deployment; only HR with the onboarding key; another company 404', async () => {
    const p = (await api('hr', 'get', path(ids.dep)).expect(want(200))).body;
    expect(p).toMatchObject({ canStart: true, block: null, rehire: false, contractor: `Sri Lakshmi Facility Services ${run}`, site: { id: ids.hsr, name: 'Hosur plant', legalEntityId: ids.entity }, uan: '100200300400', esicIp: '3100123456', idMasked: 'XXXX XXXX 4411', gatePass: 'GP-HSR-1', person: { id: ids.person, name: `Murugan ${run}` } });
    expect((await api('hr', 'get', path(ids.pending)).expect(200)).body).toMatchObject({ canStart: false, block: expect.stringMatching(/Only a deployed worker/) });
    await api('reader', 'get', path(ids.dep)).expect(403);
    await api('adminB', 'get', path(ids.dep)).expect(404);
    await api('hr', 'get', path(randomUUID())).expect(404);
    await api('hr', 'get', path('nope')).expect(400);
  });

  it('809: the gate pass photo on the same-person step; only the onboarding key; another company 404; none yet 404', async () => {
    expect((await api('hr', 'get', path(ids.dep)).expect(200)).body.photo).toBe(false);
    const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(200, 1), Buffer.from([0xff, 0xd9])]);
    await api('admin', 'post', `/contract-labour/workers/${ids.dep}/photo`).attach('file', jpg, { filename: 'm.jpg', contentType: 'image/jpeg' }).expect(want(201));
    await inA(async (tx) => tx.file.updateMany({ where: { id: (await tx.contractDeployment.findFirstOrThrow({ where: { id: ids.dep } })).photoFileId!, scanStatus: 'pending' }, data: { scanStatus: 'clean', scannedAt: new Date() } }));
    expect((await api('hr', 'get', path(ids.dep)).expect(200)).body.photo).toBe(true);
    const r = await api('hr', 'get', `${path(ids.dep)}/photo`).expect(want(200));
    expect(r.headers['content-type']).toMatch(/image\/jpeg/);
    await api('reader', 'get', `${path(ids.dep)}/photo`).expect(403);
    await api('adminB', 'get', `${path(ids.dep)}/photo`).expect(404);
    await api('hr', 'get', `${path(ids.pending)}/photo`).expect(404);
  });

  it('starting it: refused while acting, without the key, for another company, when not deployed, and on a day not after the deployment start', async () => {
    await api('acting', 'post', path(ids.dep)).send(body()).expect(403);
    await api('reader', 'post', path(ids.dep)).send(body()).expect(403);
    await api('adminB', 'post', path(ids.dep)).send(body()).expect(404);
    await api('hr', 'post', path(ids.pending)).send(body()).expect(409);
    await api('hr', 'post', path(ids.dep)).send(body({ joiningOn: addDays(today, -60) })).expect(400);
    await api('hr', 'post', path(ids.dep)).send(body({ version: 9 })).expect(409);
    await api('hr', 'post', path(ids.dep)).send(body({ joiningOn: 'soon' })).expect(400);
    expect(await inA((tx) => tx.preboarding.count())).toBe(0);
  });

  it('starts the joiner on the same person (source contract_worker); a second start is refused; the worker is untouched until joining', async () => {
    const r = (await api('hr', 'post', path(ids.dep)).send(body()).expect(want(201))).body;
    ids.pb = r.id;
    const pb = await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: r.id } }));
    expect(pb).toMatchObject({ personId: ids.person, source: 'contract_worker', contractDeploymentId: ids.dep, status: 'invited', personType: 'new' });
    expect(await inA((tx) => tx.person.count({ where: { givenName: 'Murugan' } }))).toBe(1);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'clra.worker.conversion_started', entityId: ids.dep } }))).toBe(1);
    await api('hr', 'post', path(ids.dep)).send(body()).expect(409);
    expect((await api('hr', 'get', path(ids.dep)).expect(200)).body).toMatchObject({ canStart: false, block: expect.stringMatching(/already joining/) });
    const dep = await inA((tx) => tx.contractDeployment.findUniqueOrThrow({ where: { id: ids.dep } }));
    expect(dep).toMatchObject({ status: 'deployed', releasedOn: null });
    // The joiner shows on the Onboarding board with its source.
    const board = (await api('hr', 'get', '/lifecycle/joiners').expect(200)).body;
    expect(board.joiners.find((j: { id: string }) => j.id === r.id)).toMatchObject({ source: 'contract_worker', name: `Murugan ${run}` });
  });

  it('on joining: the deployment and gate pass end the day before, the role closes, UAN and ESIC IP are raised on the employee; same person', async () => {
    const pb = await inA((tx) => tx.preboarding.findUniqueOrThrow({ where: { id: ids.pb } }));
    const done = (await api('hr', 'post', `/lifecycle/joiners/${ids.pb}/join`).send({ identityAttested: true, status: 'probation', employeeCode: `KF-${run.slice(0, 4)}`, version: pb.version }).expect(want(200))).body;
    expect(done.changeRequests).toEqual(expect.arrayContaining(['uan', 'esic']));
    const lastDay = addDays(today, -1);
    const dep = await inA((tx) => tx.contractDeployment.findUniqueOrThrow({ where: { id: ids.dep } }));
    expect(dep.status).toBe('released');
    expect(dep.releasedOn!.toISOString().slice(0, 10)).toBe(lastDay);
    expect(dep.toOn!.toISOString().slice(0, 10)).toBe(lastDay);
    expect(dep.gateValidTo!.toISOString().slice(0, 10)).toBe(lastDay);
    expect(dep.releaseReason).toBe('Joined as an employee');
    const roles = await inA((tx) => tx.personRole.findMany({ where: { personId: ids.person }, orderBy: { startOn: 'asc' } }));
    expect(roles.find((x) => x.roleType === 'contract_worker')!.endOn!.toISOString().slice(0, 10)).toBe(lastDay);
    const emp = await inA((tx) => tx.employee.findUniqueOrThrow({ where: { id: done.employeeId } }));
    expect(emp.personId).toBe(ids.person);
    expect(await inA((tx) => tx.person.count({ where: { givenName: 'Murugan' } }))).toBe(1);
    // History kept: the deployment row is still there as contract-worker history.
    expect(await inA((tx) => tx.contractDeployment.count({ where: { personId: ids.person } }))).toBe(1);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'clra.worker.converted', entityId: ids.dep } }))).toBe(1);
    // Now an employee: a further conversion is refused.
    expect((await api('hr', 'get', path(ids.dep)).expect(200)).body.canStart).toBe(false);
  });
});
