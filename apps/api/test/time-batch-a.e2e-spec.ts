import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { addDays } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Tier 1 batch A (attendance and leave daily), end to end against the real database (forced RLS, the app role): each item
// positive and negative, two companies kept apart.
describe('Time batch A', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrAdmin' | 'mgr' | 'emp' | 'peer' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  // The company calendar is India time.
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const d = (n: number) => addDays(today, n);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async () => ({ success: true })) })
      .overrideProvider(BlobStorageService)
      .useValue(createFakeBlobStorage())
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    planId = (await prisma.plan.create({ data: { name: `batch-a-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Batch A Org ${k}`, slug: `bata-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrAdmin', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['peer', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@bata-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@bata-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `Batch Foods ${k}`, shortName: `BF${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', geoLat: 12.9716, geoLng: 77.5946, geoRadiusM: 150 } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Ops', code: 'OPS', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      });
    }
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: d(-3), userId: users[who], workEmail: `${who}@bata-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.peerEmp = await hire('adminA', 'peer', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hrAdmin', null);
    ids.empBEmp = await hire('adminB', 'empB', null, 'B');
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // ------------------------------------------------------------------ item 2 (C2): my full leave history
  describe('C2 full leave history', () => {
    beforeAll(async () => {
      await inA(async (tx) => {
        const o = { organizationId: org.A.id };
        ids.cl = (await tx.leaveType.create({ data: { ...o, code: 'CL', name: 'Casual leave', kind: 'casual' } })).id;
        ids.sl = (await tx.leaveType.create({ data: { ...o, code: 'SL', name: 'Sick leave', kind: 'sick' } })).id;
        // 30 requests over two years: older than the Home's 13 months too.
        const rows = Array.from({ length: 30 }, (_, i) => ({
          ...o,
          employeeId: ids.empEmp,
          leaveTypeId: i % 3 === 0 ? ids.sl : ids.cl,
          fromOn: new Date(`${d(-20 - i * 24)}T00:00:00Z`),
          toOn: new Date(`${d(-20 - i * 24)}T00:00:00Z`),
          days: 1,
          status: i % 5 === 0 ? 'rejected' : 'approved',
          reason: i === 7 ? 'Cousin wedding in Mysuru' : `Errand ${i}`,
        }));
        await tx.leaveRequest.createMany({ data: rows });
        // Someone else's leave is never in mine.
        await tx.leaveRequest.create({ data: { ...o, employeeId: ids.peerEmp, leaveTypeId: ids.cl, fromOn: new Date(`${d(-30)}T00:00:00Z`), toOn: new Date(`${d(-30)}T00:00:00Z`), days: 1, status: 'approved', reason: 'Cousin wedding' } });
      });
    });

    it('every request, newest first, a page at a time; the Home still shows the last 13 months only', async () => {
      const p1 = (await api('emp', 'get', '/time/me/leave/history?page=1&pageSize=25').expect(200)).body;
      expect(p1).toMatchObject({ total: 30, page: 1, pageSize: 25 });
      expect(p1.rows).toHaveLength(25);
      expect(p1.rows[0].from > p1.rows[1].from).toBe(true);
      expect((await api('emp', 'get', '/time/me/leave/history?page=2&pageSize=25').expect(200)).body.rows).toHaveLength(5);
      expect((await api('emp', 'get', '/time/me/leave').expect(200)).body.requests.length).toBeLessThan(30);
    });

    it('filters by type, status, dates and the reason', async () => {
      const sick = (await api('emp', 'get', `/time/me/leave/history?types=${ids.sl}`).expect(200)).body;
      expect(sick.total).toBe(10);
      expect(sick.rows.every((r: { type: { id: string } }) => r.type.id === ids.sl)).toBe(true);
      expect((await api('emp', 'get', '/time/me/leave/history?statuses=rejected').expect(200)).body.total).toBe(6);
      expect((await api('emp', 'get', `/time/me/leave/history?from=${d(-100)}&to=${d(-20)}`).expect(200)).body.total).toBe(4);
      const q = (await api('emp', 'get', '/time/me/leave/history?q=wedding').expect(200)).body;
      expect(q.rows.map((r: { reason: string }) => r.reason)).toEqual(['Cousin wedding in Mysuru']);
    });

    it('negative: a bad status, type or page is refused; another company and a colleague see none of it', async () => {
      await api('emp', 'get', '/time/me/leave/history?statuses=lost').expect(400);
      await api('emp', 'get', '/time/me/leave/history?types=not-a-uuid').expect(400);
      await api('emp', 'get', '/time/me/leave/history?page=0').expect(400);
      await api('emp', 'get', '/time/me/leave/history?pageSize=1000').expect(400);
      expect((await api('empB', 'get', '/time/me/leave/history').expect(200)).body.total).toBe(0);
      expect((await api('peer', 'get', '/time/me/leave/history').expect(200)).body.total).toBe(1);
    });
  });
});
