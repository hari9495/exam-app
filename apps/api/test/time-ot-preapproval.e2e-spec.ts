import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { BlobStorageService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { DayEngine } from '../src/time/day-engine.service';
import { addDays, instantAt } from '../src/time/time-maths';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// TIM-07 Ot overtime pre-approval (Nov 2026), end to end against the real database (forced RLS, the app role): the
// employee asks ahead and the manager approves or turns it down; the manager plans it for a report; a claim reads the
// plan (company setting: flag, refuse or allow a claim without one). Each: the positive path, the wrong role, another
// company, bad input, a repeat.
describe('Time overtime pre-approval', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let dayEngine: DayEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'mgr' | 'emp' | 'emp2' | 'emp3' | 'emp4' | 'mgr2' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  type Tx = Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0];
  const inA = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const ZONE = 'Asia/Kolkata';
  const today = DateTime.now().setZone(ZONE).toISODate()!;
  const d = (n: number) => addDays(today, n);
  const asDate = (on: string) => new Date(`${on}T00:00:00Z`);
  const Y = Number(today.slice(0, 4));
  const lastYearEnd = `${Y - 1}-12-31`;
  // A month two ahead, so every day of it is still to come.
  const M = DateTime.fromISO(today).plus({ months: 2 }).toFormat('yyyy-MM');
  const login = (who: Who) => request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[who === 'adminB' || who === 'empB' ? 'B' : 'A'].slug, email: `${who}@ot-${run}.test`, password: PASSWORD });
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject' | 'send_back', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  const taskOf = async (requestId: string) => {
    const r = await inA((tx) => tx.attendanceRequest.findFirstOrThrow({ where: { id: requestId } }));
    return (await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: r.wfRequestId!, status: 'open' } }))).id;
  };
  // Kind "other": no state floor raises the carry cap or the credit, so the numbers stay the policy's own.
  const typeBody = (over: Record<string, unknown> = {}, rules: Record<string, unknown> = {}) => ({ code: 'EL', name: 'Earned leave', kind: 'other', paid: true, ...over, rules: { halfDays: true, ...rules } });

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
    dayEngine = moduleRef.get(DayEngine);

    planId = (await prisma.plan.create({ data: { name: `ot-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `OT Org ${k}`, slug: `ot-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, name: string, keys: readonly string[]) => (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', ROLE_TEMPLATES.find((t) => t.key === 'hr_admin')!.permissions],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['emp3', 'A', 'panel', null],
      ['emp4', 'A', 'panel', null],
      ['mgr2', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? await profile(o, who, keys) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@ot-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await login(who).expect(200)).body.accessToken;
    }
    for (const k of ['A', 'B'] as const) {
      await tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, async (tx) => {
        const o = { organizationId: org[k].id };
        ids[`entity${k}`] = (await tx.legalEntity.create({ data: { ...o, name: `OT Foods ${k}`, shortName: `OT${k}-${run}`, isDefault: true } })).id;
        ids[`loc${k}`] = (await tx.location.create({ data: { ...o, legalEntityId: ids[`entity${k}`], name: 'Chennai office', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: ZONE, ipRanges: ['10.20.4.0/24'] } })).id;
        const deptId = randomUUID();
        ids[`dept${k}`] = (await tx.department.create({ data: { ...o, id: deptId, name: 'Quality', code: 'QA', path: `/${deptId}/` } })).id;
        ids[`desig${k}`] = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
        ids[`perm${k}`] = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
        // Every day a working day (no weekly offs), 9:30 am to 6:30 pm.
        await tx.locationAttendanceRule.create({ data: { ...o, locationId: ids[`loc${k}`], validFrom: new Date('2024-01-01T00:00:00Z'), shiftStart: 570, shiftEnd: 1110, weeklyOffs: [] } });
      });
    }
    const joined = `${Y - 1}-01-01`;
    const hire = async (admin: 'adminA' | 'adminB', who: Who, manager: string | null, k: 'A' | 'B' = 'A') =>
      (
        await api(admin, 'post', '/people/employees')
          .send({ legalEntityId: ids[`entity${k}`], status: 'confirmed', reason: 'Joined', overrideReason: 'Joined before this year (test data)', givenName: who, familyName: run, joinedOn: joined, userId: users[who], workEmail: `${who}@ot-${run}.test`, assignment: { locationId: ids[`loc${k}`], departmentId: ids[`dept${k}`], designationId: ids[`desig${k}`], employmentTypeId: ids[`perm${k}`], managerEmployeeId: manager } })
          .then((r) => {
            if (r.status !== 201) throw new Error(`hire ${who}: ${r.status} ${JSON.stringify(r.body)}`);
            return r;
          })
      ).body.id as string;
    ids.mgrEmp = await hire('adminA', 'mgr', null);
    ids.mgr2Emp = await hire('adminA', 'mgr2', null);
    ids.empEmp = await hire('adminA', 'emp', ids.mgrEmp);
    ids.emp2Emp = await hire('adminA', 'emp2', ids.mgrEmp);
    ids.emp3Emp = await hire('adminA', 'emp3', ids.mgrEmp);
    ids.emp4Emp = await hire('adminA', 'emp4', ids.mgrEmp);
    ids.hrEmp = await hire('adminA', 'hr', null);
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


  const work = async (who: string, on: string, inMin: number, outMin: number) => {
    await inA((tx) =>
      tx.punch.createMany({
        data: [
          { organizationId: org.A.id, employeeId: ids[`${who}Emp`], punchedAt: instantAt(on, ZONE, inMin), workOn: asDate(on), kind: 'in', accepted: true, verdict: 'no_fence' },
          { organizationId: org.A.id, employeeId: ids[`${who}Emp`], punchedAt: instantAt(on, ZONE, outMin), workOn: asDate(on), kind: 'out', accepted: true, verdict: 'no_fence' },
        ],
      }),
    );
    await inA((tx) => dayEngine.evaluate(tx, { organizationId: org.A.id, isSuperAdmin: false }, ids[`${who}Emp`], on, on));
  };
  const planTask = async (planId: string) => {
    const p = await inA((tx) => tx.overtimePlan.findFirstOrThrow({ where: { id: planId } }));
    return (await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: p.wfRequestId!, status: 'open' } }))).id;
  };
  const plan = (over: Record<string, unknown> = {}) => ({ on: today, minutes: 120, takeAs: 'pay', reason: 'Batch release', ...over });
  const setPre = (value: string) => api('adminA', 'put', '/org/settings').send({ key: 'attendance.overtime.pre_approval', value, scopeType: 'tenant' }).expect(200);

  it('set-up: a comp-off type and an overtime rule from today', async () => {
    await api('hr', 'post', '/time/setup/types').send({ code: 'CO', name: 'Comp-off', kind: 'comp_off', paid: true }).expect(201);
    await api('hr', 'post', '/time/ot-rules').send({ name: 'Staff OT', scopeType: 'tenant', validFrom: today, minMinutes: 30, roundMinutes: 15, rateNormal: 2, rateWeeklyOff: 2, rateHoliday: 2, needsApproval: true, settle: 'pay', compOffHalfMinutes: 60, compOffFullMinutes: 240 }).expect(201);
  });

  it('asking ahead: bad input and the window are refused; one a day; only the manager decides', async () => {
    expect((await api('emp', 'post', '/time/me/overtime/plans').send(plan({ on: d(-1) })).expect(400)).body.message).toMatch(/today or a later date/);
    expect((await api('emp', 'post', '/time/me/overtime/plans').send(plan({ on: d(31) })).expect(400)).body.message).toBe('Pick a date in the next 30 days.');
    await api('emp', 'post', '/time/me/overtime/plans').send(plan({ minutes: 20 })).expect(400);
    expect((await api('emp', 'post', '/time/me/overtime/plans').send(plan({ minutes: 50 })).expect(400)).body.message).toMatch(/quarter hours/);
    await api('emp', 'post', '/time/me/overtime/plans').send(plan({ minutes: 735 })).expect(400);
    await api('emp', 'post', '/time/me/overtime/plans').send(plan({ takeAs: 'cash' })).expect(400);
    await api('emp', 'post', '/time/me/overtime/plans').send(plan({ reason: '   ' })).expect(400);
    await api('emp', 'post', '/time/me/overtime/plans').send(plan({ extra: 1 })).expect(400);
    ids.plan = (await api('emp', 'post', '/time/me/overtime/plans').send(plan()).expect(201)).body.id;
    expect((await api('emp', 'post', '/time/me/overtime/plans').send(plan({ minutes: 60 })).expect(409)).body.message).toMatch(/already asked for/);
    const task = await planTask(ids.plan);
    for (const who of ['mgr2', 'empB', 'emp', 'emp2'] as const) await decide(who, task, 'approve').expect(404);
    expect((await decide('mgr', task, 'approve').expect(200)).body.status).toBe('approved');
    expect((await inA((tx) => tx.overtimePlan.findFirstOrThrow({ where: { id: ids.plan } }))).status).toBe('approved');
    expect((await api('emp', 'get', '/time/me/overtime').expect(200)).body.plans).toEqual([expect.objectContaining({ id: ids.plan, minutes: 120, takeAs: 'pay', status: 'approved' })]);
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'time.ot.plan_requested', entityId: ids.plan } }))).toBe(1);
  });

  it('the manager turns one down; a waiting one can be withdrawn only by its owner, once', async () => {
    const a = (await api('emp4', 'post', '/time/me/overtime/plans').send(plan({ on: d(1) })).expect(201)).body.id;
    await decide('mgr', await planTask(a), 'reject', 'No line run that day').expect(200);
    expect((await inA((tx) => tx.overtimePlan.findFirstOrThrow({ where: { id: a } }))).status).toBe('rejected');
    const b = (await api('emp4', 'post', '/time/me/overtime/plans').send(plan({ on: d(1) })).expect(201)).body.id;
    await api('emp', 'post', `/time/me/overtime/plans/${b}/withdraw`).expect(404);
    await api('empB', 'post', `/time/me/overtime/plans/${b}/withdraw`).expect(404);
    expect((await api('emp4', 'post', `/time/me/overtime/plans/${b}/withdraw`).expect(200)).body.status).toBe('withdrawn');
    await api('emp4', 'post', `/time/me/overtime/plans/${b}/withdraw`).expect(409);
  });

  it('the manager plans it for a report (approved at once); never for themselves, another team or another company', async () => {
    const p = (await api('mgr', 'post', `/time/team/overtime/plans/${ids.emp4Emp}`).send(plan({ on: d(2), takeAs: 'comp_off' })).expect(201)).body;
    expect(p).toMatchObject({ status: 'approved', takeAs: 'comp_off', minutes: 120 });
    expect(await inA((tx) => tx.auditLog.count({ where: { action: 'time.ot.plan_approved', entityId: p.id } }))).toBe(1);
    await api('mgr', 'post', `/time/team/overtime/plans/${ids.mgrEmp}`).send(plan({ on: d(2) })).expect(403);
    await api('mgr2', 'post', `/time/team/overtime/plans/${ids.emp4Emp}`).send(plan({ on: d(3) })).expect(404);
    await api('emp', 'post', `/time/team/overtime/plans/${ids.emp4Emp}`).send(plan({ on: d(3) })).expect(404);
    await api('adminB', 'post', `/time/team/overtime/plans/${ids.emp4Emp}`).send(plan({ on: d(3) })).expect(404);
    await api('mgr', 'post', `/time/team/overtime/plans/${ids.emp4Emp}`).send(plan({ on: d(2) })).expect(409);
  });

  it('a claim reads the plan: pre-approved hours go with it to the approver', async () => {
    await work('emp', today, 570, 1110 + 90);
    const claim = (await api('emp', 'post', '/time/me/overtime').send({ on: today, reason: 'Batch release' }).expect(201)).body;
    expect(claim).toMatchObject({ planId: ids.plan, preApprovedMinutes: 120, payableMinutes: 90, settle: 'pay' });
    const wf = await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: claim.id } }));
    expect(JSON.stringify(wf.summary)).toContain('Pre-approved up to 2 h');
  });

  it('a claim without a plan: flagged by default, refused when the company says so, plain when allowed', async () => {
    await work('emp2', today, 570, 1110 + 60);
    const flagged = (await api('emp2', 'post', '/time/me/overtime').send({ on: today, reason: 'Stayed on' }).expect(201)).body;
    expect(flagged).toMatchObject({ planId: null, preApprovedMinutes: null });
    expect(JSON.stringify((await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: flagged.id } }))).summary)).toContain('Not pre-approved');
    await setPre('refuse');
    await work('emp3', today, 570, 1110 + 60);
    const refused = await api('emp3', 'post', '/time/me/overtime').send({ on: today, reason: 'Stayed on' }).expect(400);
    expect(refused.body).toMatchObject({ code: 'OT_NOT_PRE_APPROVED' });
    expect(await inA((tx) => tx.overtimeRequest.count({ where: { employeeId: ids.emp3Emp } }))).toBe(0);
    await setPre('allow');
    const plain = (await api('emp3', 'post', '/time/me/overtime').send({ on: today, reason: 'Stayed on' }).expect(201)).body;
    expect(JSON.stringify((await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { subjectId: plain.id } }))).summary)).not.toContain('pre-approved');
    await setPre('flag');
  });

  it('another company: sees none of these records; its own plan is untouched; the database never deletes one', async () => {
    const inB = <T>(fn: (tx: Tx) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, fn);
    expect(await inB((tx) => tx.overtimePlan.count({ where: { id: ids.plan } }))).toBe(0);
    expect(await inB((tx) => tx.overtimePlan.count())).toBe(0);
    await api('adminB', 'post', '/time/setup/types').send({ code: 'CO', name: 'Comp-off', kind: 'comp_off', paid: true }).expect(201);
    await api('adminB', 'post', '/time/ot-rules').send({ name: 'B OT', scopeType: 'tenant', validFrom: today, minMinutes: 30, roundMinutes: 15, rateNormal: 2, rateWeeklyOff: 2, rateHoliday: 2, needsApproval: true, settle: 'pay', compOffHalfMinutes: 60, compOffFullMinutes: 240 }).expect(201);
    const pb = (await api('empB', 'post', '/time/me/overtime/plans').send(plan()).expect(201)).body.id;
    await api('emp', 'post', `/time/me/overtime/plans/${pb}/withdraw`).expect(404);
    expect((await inB((tx) => tx.overtimePlan.findFirstOrThrow({ where: { id: pb } }))).status).toBe('pending');
    expect(await inA((tx) => tx.overtimePlan.count({ where: { id: pb } }))).toBe(0);
    await expect(inA((tx) => tx.overtimePlan.delete({ where: { id: ids.plan } }))).rejects.toThrow();
    // Writing a row for another company is refused by RLS.
    await expect(inA((tx) => tx.overtimePlan.create({ data: { organizationId: org.B.id, employeeId: ids.empBEmp, workOn: asDate(d(5)), plannedMinutes: 60, reason: 'x' } }))).rejects.toThrow();
  });
});
