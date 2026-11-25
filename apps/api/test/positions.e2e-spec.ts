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
import { todayIst } from '../src/org-structure/org-validation';
import { addDays } from '../src/time/time-maths';
import { markSteppedUp } from './fixtures/step-up';

// Enterprise E1 positions end to end (answers 2340, 2341, 2641-2643): off by default; the switch-on plan is sent by one HR
// person and approved by another, who links everyone to a seat built from today's jobs; seat changes (one or many) go
// through P03 and are approved by someone other than the requester; with positions on, a hire, promotion or transfer
// names an active seat with room; a requisition is capped by the seat's openings; the org chart shows empty seats; another
// company sees nothing; acting for someone else changes nothing; bad input is refused. The new tables have forced RLS.

describe('Enterprise E1 positions', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  const today = todayIst();
  let billingPlanId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hrA' | 'hrB' | 'viewer' | 'emp';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  type Row = { id: string; code: string; title: string; status: string; headcount: number; filled: number; vacant: number; supervisor: { id: string } | null; pendingChange: boolean; entrySalary?: number | null };
  const list = async (who: Who = 'hrA') => (await api(who, 'get', '/org/positions').expect(200)).body as { enabled: boolean; rows: Row[]; totals: { vacant: number } };
  const seat = async (title: string) => (await list()).rows.find((r) => r.title === title)!;
  const approveAs = async (who: Who, requestId: string) => {
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId, assigneeUserId: users[who], status: 'open' } }));
    await request(server()).post(`/api/v1/workflow/approvals/tasks/${task.id}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision: 'approve' }).expect(200);
  };
  const hire = (who: Who, name: string, desig: string, positionId?: string, manager?: string, joinedOn = today) =>
    api(who, 'post', '/people/employees').send({
      legalEntityId: ids.entityA,
      status: 'confirmed',
      reason: 'Joined',
      givenName: name,
      familyName: run,
      joinedOn,
      workEmail: `${name.toLowerCase()}@pos-${run}.test`,
      assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids[desig], gradeId: ids.grade, employmentTypeId: ids.perm, managerEmployeeId: manager ?? null, ...(positionId ? { positionId } : {}) },
    });
  const HR_KEYS = ['org.position.manage', 'org.structure.view', 'employee.profile.view', 'employee.change.manage', 'employee.change.approve', 'pay.range.view'];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
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

    billingPlanId = (await prisma.plan.create({ data: { name: `pos-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Positions Org ${k}`, slug: `pos-${k.toLowerCase()}-${run}`, planId: billingPlanId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hrA', 'A', 'panel', HR_KEYS],
      ['hrB', 'A', 'panel', [...HR_KEYS, 'ats.headcount.manage', 'payroll.cost_rate.view']],
      ['viewer', 'A', 'panel', ['org.structure.view']],
      ['emp', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pos-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pos-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entityA = (await tx.legalEntity.create({ data: { ...o, name: `Seat Foods ${run}`, shortName: `SF-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...o, legalEntityId: ids.entityA, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', geoLat: 12.9716, geoLng: 77.5946, geoRadiusM: 150 } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Stores', code: 'STR', path: `/${deptId}/` } })).id;
      ids.cashier = (await tx.designation.create({ data: { ...o, name: 'Cashier', code: 'CA' } })).id;
      ids.lead = (await tx.designation.create({ data: { ...o, name: 'Store lead', code: 'SL' } })).id;
      ids.grade = (await tx.grade.create({ data: { ...o, name: 'G3', code: 'G3', rank: 3 } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, async (tx) => {
      ids.entityB = (await tx.legalEntity.create({ data: { organizationId: org.B.id, name: `Other ${run}`, shortName: `OT-${run}`, isDefault: true } })).id;
    });
    ids.lead1 = (await hire('adminA', 'Lakshmi', 'lead').expect(201)).body.id;
    ids.cash1 = (await hire('adminA', 'Ravi', 'cashier', undefined, ids.lead1).expect(201)).body.id;
    ids.cash2 = (await hire('adminA', 'Meera', 'cashier', undefined, ids.lead1).expect(201)).body.id;
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: billingPlanId } }).catch(() => undefined);
    await app.close();
  });

  it('the new tables have forced RLS, and the app role cannot delete from them', async () => {
    const rows = await prisma.$queryRaw<{ t: string }[]>`SELECT c.relname AS t FROM pg_class c WHERE c.relname IN ('positions', 'position_versions', 'position_changes') AND c.relrowsecurity AND c.relforcerowsecurity ORDER BY 1`;
    expect(rows.map((r) => r.t)).toEqual(['position_changes', 'position_versions', 'positions']);
    const grants = await prisma.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE grantee = 'app_runtime' AND table_name IN ('positions', 'position_versions', 'position_changes') AND privilege_type IN ('DELETE', 'TRUNCATE')`;
    expect(grants[0].n).toBe(0);
  });

  it('off by default: nothing to list, a seat cannot be given, and only seat keys may look (negative)', async () => {
    expect(await list()).toMatchObject({ enabled: false, rows: [] });
    await api('viewer', 'get', '/org/positions').expect(200);
    await api('emp', 'get', '/org/positions').expect(403);
    await api('emp', 'post', '/org/positions/changes').send({ items: [], reason: 'Nothing at all here' }).expect(403);
    await api('viewer', 'get', '/org/positions/switch-on').expect(403);
    expect((await hire('adminA', 'Early', 'cashier', randomUUID()).expect(400)).body.message).toMatch(/does not use positions/);
  });

  it('switch-on: one HR person sends the plan, another approves; everyone gets a seat and positions go on', async () => {
    const preview = (await api('hrA', 'get', '/org/positions/switch-on').expect(200)).body;
    expect(preview).toMatchObject({ enabled: false, people: 3, plan: null, canSend: true, canApprove: true });
    expect(preview.seats.map((s: { title: string; headcount: number }) => [s.title, s.headcount]).sort()).toEqual([['Cashier', 2], ['Store lead', 1]]);
    expect(preview.seats.find((s: { title: string }) => s.title === 'Cashier').supervisorKey).toBe(preview.seats.find((s: { title: string }) => s.title === 'Store lead').key);
    await api('hrA', 'post', '/org/positions/switch-on').send({ reason: 'short' }).expect(400);
    const { batchId } = (await api('hrA', 'post', '/org/positions/switch-on').send({ reason: 'We plan by seats from this year on' }).expect(201)).body;
    await api('hrB', 'post', '/org/positions/switch-on').send({ reason: 'We plan by seats from this year on' }).expect(409);
    expect((await api('hrA', 'post', `/org/positions/switch-on/${batchId}/approve`).expect(403)).body.message).toMatch(/someone else/);
    await api('viewer', 'post', `/org/positions/switch-on/${batchId}/approve`).expect(403);
    const done = (await api('hrB', 'post', `/org/positions/switch-on/${batchId}/approve`).expect(201)).body;
    expect(done).toEqual({ seats: 2, linked: 3, failed: [] });
    await api('hrB', 'post', `/org/positions/switch-on/${batchId}/approve`).expect(409);
    const after = await list();
    expect(after.enabled).toBe(true);
    const cashier = after.rows.find((r) => r.title === 'Cashier')!;
    const lead = after.rows.find((r) => r.title === 'Store lead')!;
    expect(cashier).toMatchObject({ status: 'active', headcount: 2, filled: 2, vacant: 0, supervisor: { id: lead.id } });
    expect(lead).toMatchObject({ headcount: 1, filled: 1, supervisor: null });
    ids.cashierSeat = cashier.id;
    ids.leadSeat = lead.id;
    const record = (await api('viewer', 'get', `/org/positions/${cashier.id}`).expect(200)).body;
    expect(record.incumbents.map((p: { name: string }) => p.name).sort()).toEqual([`Meera ${run}`, `Ravi ${run}`]);
    expect(record).not.toHaveProperty('current.entrySalary');
    expect((await api('viewer', 'get', `/org/positions/${lead.id}`).expect(200)).body.reports).toEqual([expect.objectContaining({ id: cashier.id })]);
    await api('hrA', 'post', '/org/positions/switch-on').send({ reason: 'We plan by seats from this year on' }).expect(409);
  });

  it('seat changes, one or many, are approved by someone else; the seat history keeps every version', async () => {
    const reason = 'A new counter opens at the Bengaluru store';
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'change', positionId: ids.cashierSeat, effectiveOn: addDays(today, -1), values: { headcount: 3 } }], reason }).expect(400);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'create', legalEntityId: ids.entityA, effectiveOn: today, values: { title: 'x', departmentId: ids.dept, locationId: ids.loc, designationId: ids.cashier } }], reason }).expect(400);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'change', positionId: ids.cashierSeat, effectiveOn: addDays(today, 1), values: { headcount: 1 } }], reason }).expect(409);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'eliminate', positionId: ids.cashierSeat, effectiveOn: addDays(today, 1) }], reason }).expect(409);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'freeze', positionId: ids.cashierSeat, effectiveOn: today }], reason }).expect(409);
    const sent = (
      await api('hrA', 'post', '/org/positions/changes')
        .send({
          items: [
            { kind: 'create', legalEntityId: ids.entityA, effectiveOn: addDays(today, 1), values: { title: 'Senior cashier', departmentId: ids.dept, locationId: ids.loc, designationId: ids.cashier, gradeIds: [ids.grade], headcount: 1, supervisorPositionId: ids.leadSeat, entrySalary: 480000 } },
            { kind: 'change', positionId: ids.cashierSeat, effectiveOn: addDays(today, 1), values: { headcount: 3 } },
          ],
          reason,
        })
        .expect(201)
    ).body;
    expect(sent).toMatchObject({ count: 2, requestId: expect.any(String) });
    await api('hrB', 'post', '/org/positions/changes').send({ items: [{ kind: 'freeze', positionId: ids.cashierSeat, effectiveOn: addDays(today, 2) }], reason }).expect(409);
    expect((await seat('Cashier')).pendingChange).toBe(true);
    await expect(inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: sent.requestId, assigneeUserId: users.hrA } }))).rejects.toThrow();
    await approveAs('hrB', sent.requestId);
    // From tomorrow: the new seat and the bigger one.
    const tomorrow = (await api('hrA', 'get', `/org/positions?asOf=${addDays(today, 1)}`).expect(200)).body as { rows: Row[] };
    expect(tomorrow.rows.find((r) => r.title === 'Senior cashier')).toMatchObject({ code: expect.stringMatching(/^POS-\d{5}$/), status: 'active', headcount: 1, vacant: 1, entrySalary: 480000 });
    expect(tomorrow.rows.find((r) => r.title === 'Cashier')).toMatchObject({ headcount: 3, filled: 2, vacant: 1, pendingChange: false });
    expect((await seat('Cashier')).headcount).toBe(2);
    expect((await api('viewer', 'get', '/org/positions').expect(200)).body.rows[0]).not.toHaveProperty('entrySalary');
    const history = (await api('hrA', 'get', `/org/positions/${ids.cashierSeat}?asOf=${addDays(today, 1)}`).expect(200)).body.history;
    expect(history.map((h: { headcount: number }) => h.headcount)).toEqual([3, 2]);
    ids.seniorSeat = tomorrow.rows.find((r) => r.title === 'Senior cashier')!.id;
    // A withdrawn change leaves the seat as it was.
    const w = (await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'freeze', positionId: ids.seniorSeat, effectiveOn: addDays(today, 3) }], reason }).expect(201)).body;
    await api('hrB', 'post', `/org/positions/changes/${w.batchId}/withdraw`).expect(403);
    await api('hrA', 'post', `/org/positions/changes/${w.batchId}/withdraw`).expect(201);
    await api('hrA', 'post', `/org/positions/changes/${w.batchId}/withdraw`).expect(409);
  });

  it('with positions on, a hire names an active seat with room (positive and negative)', async () => {
    expect((await hire('adminA', 'Noseat', 'cashier').expect(400)).body.message).toMatch(/choose the seat/);
    expect((await hire('adminA', 'Full', 'lead', ids.leadSeat, ids.lead1).expect(400)).body.message).toMatch(/full/);
    expect((await hire('adminA', 'Early', 'cashier', ids.seniorSeat, ids.lead1).expect(400)).body.message).toMatch(/No such seat/);
    ids.cash3 = (await hire('adminA', 'Asha', 'cashier', ids.cashierSeat, ids.lead1, addDays(today, 1)).expect(201)).body.id;
    expect((await api('hrA', 'get', `/org/positions/${ids.cashierSeat}?asOf=${addDays(today, 1)}`).expect(200)).body).toMatchObject({ filled: 3, vacant: 0 });
    expect((await hire('adminA', 'Late', 'cashier', ids.cashierSeat, ids.lead1, addDays(today, 1)).expect(400)).body.message).toMatch(/full/);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'change', positionId: ids.cashierSeat, effectiveOn: addDays(today, 2), values: { headcount: 2 } }], reason: 'Back to two counters again' }).expect(409);
  });

  it('a requisition against a seat is capped by its openings; without a seat it needs the outside-plan reason', async () => {
    const job = (h: number, positionId: string | null, outsidePlan = false) =>
      inA(async (tx) => (await tx.job.create({ data: { organizationId: org.A.id, title: `Cashier ${run} ${h}`, createdById: users.adminA, status: 'draft', requisitionReason: 'new', headcount: h, positionId, outsidePlan, outsidePlanReason: outsidePlan ? 'A one-off for the festival' : null } })).id);
    expect((await api('adminA', 'post', `/jobs/${await job(1, null)}/submit`).expect(400)).body.message).toMatch(/against a seat/);
    expect((await api('adminA', 'post', `/jobs/${await job(1, ids.cashierSeat)}/submit`).expect(400)).body.message).toMatch(/no openings/);
    // Outside the plan: the extra step goes to the headcount approvers (hrB here).
    expect((await api('adminA', 'post', `/jobs/${await job(1, null, true)}/submit`).expect(201)).body).toMatchObject({ status: 'pending_approval' });
  });

  it('the org chart shows an empty seat under the person in the seat above', async () => {
    await inA((tx) => tx.positionVersion.create({ data: { organizationId: org.A.id, positionId: ids.leadSeat, validFrom: new Date(`${addDays(today, 5)}T00:00:00Z`), status: 'active', title: 'Store lead', departmentId: ids.dept, locationId: ids.loc, designationId: ids.lead, headcount: 2 } }));
    const chart = (await api('adminA', 'get', `/people/org-chart?asOf=${addDays(today, 5)}`).expect(200)).body;
    const lead = chart.vacancies.find((x: { id: string }) => x.id === `pos:${ids.leadSeat}`);
    expect(lead).toMatchObject({ role: 'Store lead', openings: 1 });
    const senior = chart.vacancies.find((x: { id: string }) => x.id === `pos:${ids.seniorSeat}`);
    expect(senior).toMatchObject({ role: 'Senior cashier', managerId: ids.lead1, openings: 1 });
  });

  it('answer 2682: what a seat costs a year shows only with the cost-rate key, from the people in it (positive and negative)', async () => {
    await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entityA}}`}, true)`;
      for (const [emp, cost] of [[ids.cash1, 30000], [ids.cash2, 28000]] as const)
        await tx.employeeCostRate.create({ data: { organizationId: org.A.id, legalEntityId: ids.entityA, employeeId: emp, periodStart: new Date(`${today.slice(0, 7)}-01T00:00:00Z`), employerCost: cost, standardHours: 208, rate: cost / 208, sourcePayslipId: randomUUID() } });
    });
    const row = (await api('hrB', 'get', '/org/positions').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.cashierSeat);
    expect(row.yearlyCost).toBe((30000 + 28000) * 12);
    expect((await api('hrB', 'get', '/org/positions').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.seniorSeat)?.yearlyCost ?? null).toBeNull();
    expect((await api('hrA', 'get', '/org/positions').expect(200)).body.rows[0]).not.toHaveProperty('yearlyCost');
  });

  it('answer 2680: a restructure names each person\'s seat; without one, or a full one, the person cannot move (positive and negative)', async () => {
    const billing = await inA(async (tx) => {
      const id = randomUUID();
      return (await tx.department.create({ data: { organizationId: org.A.id, id, name: 'Billing', code: 'BIL', path: `/${id}/` } })).id;
    });
    const setup = (await api('hrA', 'get', '/people/restructures/setup').expect(200)).body;
    expect(setup.positions.entityIds).toEqual([ids.entityA]);
    // The seat planned from tomorrow is offered with its room.
    expect(setup.positions.seats.find((x: { id: string }) => x.id === ids.seniorSeat)).toMatchObject({ title: 'Senior cashier', open: 1, legalEntityId: ids.entityA });
    const plan = (seatMap?: Record<string, unknown>) => ({
      kind: 'within', fromEntityId: ids.entityA, effectiveDate: addDays(today, 1), employeeIds: [ids.cash2], target: { departmentId: billing },
      defaults: { leave: 'carry', service: 'keep', code: 'keep', salary: 'keep' }, reason: 'Billing desk opens', ...(seatMap ? { seatMap } : {}),
    });
    const person = async (body: object) => (await api('hrA', 'post', '/people/restructures/preview').send(body).expect(200)).body.people[0];
    expect(await person(plan())).toMatchObject({ status: 'failed', reason: expect.stringMatching(/choose the seat/) });
    expect(await person(plan({ [ids.cash2]: ids.leadSeat }))).toMatchObject({ status: 'failed', reason: expect.stringMatching(/full/) });
    expect((await api('hrA', 'post', '/people/restructures/preview').send(plan({ [ids.cash2]: 'not-a-seat' })).expect(400)).body.message).toMatch(/seatMap maps ids to ids/);
    expect(await person(plan({ [ids.cash2]: ids.seniorSeat }))).toMatchObject({ status: 'ready' });
    await api('hrA', 'post', '/people/restructures').send(plan()).expect(400);
    const sent = (await api('hrA', 'post', '/people/restructures').send(plan({ [ids.cash2]: ids.seniorSeat })).expect(201)).body;
    await markSteppedUp(tenantPrisma, token.hrA);
    await markSteppedUp(tenantPrisma, token.hrB);
    await api('hrA', 'post', `/people/restructures/${sent.id}/approve`).send({}).expect(403);
    await api('hrB', 'post', `/people/restructures/${sent.id}/approve`).send({}).expect(200);
    const change = await inA((tx) => tx.employeeChange.findFirstOrThrow({ where: { employeeId: ids.cash2, changeType: 'transfer' } }));
    expect(change.payload).toMatchObject({ assignment: { departmentId: billing, positionId: ids.seniorSeat } });
    expect((await api('hrA', 'get', `/org/positions/${ids.seniorSeat}?asOf=${addDays(today, 1)}`).expect(200)).body).toMatchObject({ filled: 1, vacant: 0 });
  });

  it('answer 2683: someone left without a seat is given one by a correction another HR person approves (positive and negative)', async () => {
    // Someone with no seat (as the switch-on leaves out its own approver): Kiran joined while positions were briefly off.
    const flag = (value: string) => inA((tx) => tx.setting.updateMany({ where: { organizationId: org.A.id, key: 'org.positions.enabled' }, data: { value } }));
    await flag('off');
    ids.kiran = (await hire('adminA', 'Kiran', 'cashier', undefined, ids.lead1).expect(201)).body.id;
    await flag('on');
    const record = (await api('hrA', 'get', `/org/positions/${ids.cashierSeat}`).expect(200)).body;
    expect(record.unseated).toEqual([expect.objectContaining({ employeeId: ids.kiran, name: `Kiran ${run}` })]);
    expect((await api('viewer', 'get', `/org/positions/${ids.cashierSeat}`).expect(200)).body).not.toHaveProperty('unseated');
    const give = (positionId: string) => api('hrA', 'post', '/people/changes').send({ employeeId: ids.kiran, changeType: 'correction', effectiveDate: addDays(today, 1), payload: { assignment: { positionId } }, reason: 'Left out at the switch-on' });
    expect((await give(ids.leadSeat).expect(400)).body.message).toMatch(/full/);
    await api('viewer', 'post', '/people/changes').send({ employeeId: ids.kiran, changeType: 'correction', effectiveDate: addDays(today, 1), payload: { assignment: { positionId: ids.cashierSeat } }, reason: 'Left out at the switch-on' }).expect(403);
    const sent = (await give(ids.cashierSeat).expect(201)).body;
    expect(sent.status).toBe('pending');
    await markSteppedUp(tenantPrisma, token.hrA);
    await markSteppedUp(tenantPrisma, token.hrB);
    await api('hrA', 'post', `/people/changes/${sent.id}/approve`).send({}).expect(403);
    await api('hrB', 'post', `/people/changes/${sent.id}/approve`).send({}).expect(201);
    const after = (await api('hrA', 'get', `/org/positions/${ids.cashierSeat}?asOf=${addDays(today, 1)}`).expect(200)).body;
    expect(after.incumbents.map((p: { employeeId: string }) => p.employeeId)).toContain(ids.kiran);
    expect(after.unseated).toEqual([]);
  });

  it('another company sees nothing; a stranger seat or entity is refused (negative)', async () => {
    expect((await api('adminB', 'get', '/org/positions').expect(200)).body.rows).toEqual([]);
    await api('adminB', 'get', `/org/positions/${ids.cashierSeat}`).expect(404);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'create', legalEntityId: ids.entityB, effectiveOn: today, values: { title: 'Ghost seat', departmentId: ids.dept, locationId: ids.loc, designationId: ids.cashier } }], reason: 'Trying another company' }).expect(400);
    await api('hrA', 'post', '/org/positions/changes').send({ items: [{ kind: 'change', positionId: randomUUID(), effectiveOn: today, values: { headcount: 2 } }], reason: 'Trying a made-up seat' }).expect(404);
  });
});
