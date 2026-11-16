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
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Keka ideas (2026-11) end to end against the real database (forced RLS, the app role): "My team today" for a manager
// (direct reports only), the Time summary of my own weeks, and expenses saved first and claimed later.
describe('Keka ideas', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'fin' | 'boss' | 'r1' | 'r2' | 'r3' | 'peer';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const call = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const asDate = (d: string) => new Date(`${d}T00:00:00Z`);
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d80000000049454e44ae426082', 'hex');

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

    planId = (await prisma.plan.create({ data: { name: `keka-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Keka Org ${k}`, slug: `keka-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['fin', 'A', 'panel', tpl('expense_setup')],
      ['boss', 'A', 'panel', []],
      ['r1', 'A', 'panel', []],
      ['r2', 'A', 'panel', []],
      ['r3', 'A', 'panel', []],
      ['peer', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = (fn: Parameters<typeof inA>[0]) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? ((await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))) as { id: string }).id : null;
      users[who] = ((await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@keka-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))) as { id: string }).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@keka-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Keka Pvt Ltd', shortName: `KK${run.slice(0, 4).toUpperCase()}`, isDefault: true, pan: 'AAPFU0939F' } })).id;
      ids.blr = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...x, id: deptId, name: 'Sales', code: 'SAL', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.g1 = (await tx.grade.create({ data: { ...x, name: 'G1', code: 'G1', rank: 1 } })).id;
    });
    const hire = async (who: Who, given: string, code: string, managerEmployeeId: string | null) =>
      (await call('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', userId: users[who], workEmail: `${who}@keka-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, gradeId: ids.g1, employmentTypeId: ids.perm, managerEmployeeId } }).expect(201)).body.id as string;
    emp.boss = await hire('boss', 'Divya', 'KK-001', null);
    emp.r1 = await hire('r1', 'Arjun', 'KK-002', emp.boss);
    emp.r2 = await hire('r2', 'Meera', 'KK-003', emp.boss);
    emp.r3 = await hire('r3', 'Sanjay', 'KK-004', emp.boss);
    emp.peer = await hire('peer', 'Kavya', 'KK-005', null);
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('My team today', () => {
    it('a manager sees each direct report once, with today’s state; never someone outside their team', async () => {
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        await tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: emp.r1, workOn: asDate(today), mode: 'punch', status: 'not_started', firstIn: new Date(), lateMinutes: 22 } });
        await tx.attendanceRequest.create({ data: { organizationId: org.A.id, employeeId: emp.r2, workOn: asDate(today), kind: 'wfh', reason: 'Plumber visit at home this morning', status: 'approved', decidedAt: new Date() } });
        await tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: emp.peer, workOn: asDate(today), mode: 'punch', status: 'leave', leavePart: 'full' } });
      });
      const t = (await call('boss', 'get', '/time/team-today').expect(200)).body as { date: string; people: { id: string; state: string; lateMinutes: number | null }[] };
      expect(t.date).toBe(today);
      expect(t.people.map((p) => [p.id, p.state]).sort()).toEqual([[emp.r1, 'late'], [emp.r2, 'wfh'], [emp.r3, 'not_in']].sort());
      expect(t.people.find((p) => p.id === emp.r1)?.lateMinutes).toBe(22);
    });

    it('negative: someone with no reports gets nobody; another company sees nobody of this one', async () => {
      expect((await call('r1', 'get', '/time/team-today').expect(200)).body.people).toEqual([]);
      expect((await call('adminB', 'get', '/time/team-today').expect(200)).body.people).toEqual([]);
    });
  });

  describe('Time summary', () => {
    it('my weeks of the year with hours and status; never anyone else’s', async () => {
      await tenantPrisma.forTenant(SUPER, async (tx) => {
        await tx.timesheet.create({ data: { organizationId: org.A.id, employeeId: emp.r1, weekStart: asDate(`${year}-01-05`), status: 'approved', totalMinutes: 2400 } });
        await tx.timesheet.create({ data: { organizationId: org.A.id, employeeId: emp.r1, weekStart: asDate(`${year}-01-12`), status: 'pending', totalMinutes: 1980 } });
        await tx.timesheet.create({ data: { organizationId: org.A.id, employeeId: emp.r2, weekStart: asDate(`${year}-01-05`), status: 'approved', totalMinutes: 600 } });
      });
      const s = (await call('r1', 'get', `/time/me/timesheet/summary?year=${year}`).expect(200)).body as { year: number; years: number[]; weeks: { week: string; status: string; totalMinutes: number }[] };
      expect(s.weeks).toEqual([{ week: `${year}-01-05`, status: 'approved', totalMinutes: 2400 }, { week: `${year}-01-12`, status: 'pending', totalMinutes: 1980 }]);
      expect(s.years).toContain(Number(year));
      expect((await call('r2', 'get', `/time/me/timesheet/summary?year=${year}`).expect(200)).body.weeks).toEqual([{ week: `${year}-01-05`, status: 'approved', totalMinutes: 600 }]);
    });

    it('negative: a year that is not a year is refused; a year with nothing is empty', async () => {
      await call('r1', 'get', '/time/me/timesheet/summary?year=26').expect(400);
      expect((await call('r1', 'get', '/time/me/timesheet/summary?year=2001').expect(200)).body.weeks).toEqual([]);
    });
  });

  describe('Expenses saved first, claimed later', () => {
    it('saves a spend with or without a receipt; the same receipt twice is refused', async () => {
      await call('fin', 'post', '/expenses/setup/from-starter').expect(201);
      ids.plain = (await call('r1', 'post', '/expenses/me/items').send({ spentOn: today, amount: '120.50', merchant: 'Auto to client' }).expect(201)).body.id;
      ids.withReceipt = (await call('r1', 'post', '/expenses/me/items').field('spentOn', today).field('amount', '640').field('merchant', 'Cab to airport').attach('file', PNG, 'cab.png').expect(201)).body.id;
      await call('r1', 'post', '/expenses/me/items').field('spentOn', today).field('amount', '640').attach('file', PNG, 'cab-again.png').expect(409);
      const list = (await call('r1', 'get', '/expenses/me/items').expect(200)).body.items as { id: string; amount: string; receipt: boolean }[];
      expect(list.map((x) => [x.id, x.amount, x.receipt]).sort()).toEqual([[ids.plain, '120.50', false], [ids.withReceipt, '640.00', true]].sort());
      expect((await call('r2', 'get', '/expenses/me/items').expect(200)).body.items).toEqual([]);
    });

    it('negative: a future date, a zero or bad amount are refused', async () => {
      const tomorrow = new Date(new Date(`${today}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
      await call('r1', 'post', '/expenses/me/items').send({ spentOn: tomorrow, amount: '10' }).expect(400);
      await call('r1', 'post', '/expenses/me/items').send({ spentOn: today, amount: '0' }).expect(400);
      await call('r1', 'post', '/expenses/me/items').send({ spentOn: today, amount: '12.345' }).expect(400);
    });

    it('picked into my draft claim, each becomes a line with its receipt and leaves the saved list; never twice', async () => {
      ids.claim = (await call('r1', 'post', '/expenses/claims').send({ title: 'Client visits' }).expect(201)).body.id;
      const claim = (await call('r1', 'post', `/expenses/claims/${ids.claim}/items`).send({ itemIds: [ids.plain, ids.withReceipt] }).expect(200)).body as { lines: { claimed: string }[] };
      expect(claim.lines.map((l) => l.claimed).sort()).toEqual(['120.50', '640.00']);
      expect((await call('r1', 'get', '/expenses/me/items').expect(200)).body.items).toEqual([]);
      const line = await inA((tx) => tx.expenseLine.findFirstOrThrow({ where: { claimId: ids.claim, claimed: '640.00' } }));
      expect(line.receiptFileId).not.toBeNull();
      await call('r1', 'post', `/expenses/claims/${ids.claim}/items`).send({ itemIds: [ids.plain] }).expect(404);
    });

    it('negative: someone else’s saved spend or claim is refused; removing works once', async () => {
      const mine = (await call('r2', 'post', '/expenses/me/items').send({ spentOn: today, amount: '75' }).expect(201)).body.id;
      await call('r1', 'post', `/expenses/claims/${ids.claim}/items`).send({ itemIds: [mine] }).expect(404);
      await call('r2', 'post', `/expenses/claims/${ids.claim}/items`).send({ itemIds: [mine] }).expect(404);
      await call('r1', 'post', `/expenses/me/items/${mine}/remove`).expect(404);
      await call('r2', 'post', `/expenses/me/items/${mine}/remove`).expect(200);
      await call('r2', 'post', `/expenses/me/items/${mine}/remove`).expect(404);
      expect((await call('adminB', 'get', '/expenses/me/items').expect(200)).body.items).toEqual([]);
    });
  });
});
