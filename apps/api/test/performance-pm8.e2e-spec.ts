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
import { PerformancePipsService } from '../src/performance/pips.service';

// Performance batch PM8 end to end against the real database (forced RLS, the app role): a manager proposes a plan
// and HR approves it through P03 (the employee sees nothing before); the employee acknowledges with a comment; the
// manager records check-ins and the employee adds a note; a missed check-in is recorded and HR told; no plan starts
// during protected leave, and leave inside a plan moves its end; a blocked pair shows HR a warning without details;
// "not met" opens no exit by itself, HR's action opens a company-initiated exit linked to the plan; extend once; the
// PIP-status report suppresses small groups; plans follow a manager change; companies apart.

describe('Performance batch PM8', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let pips: PerformancePipsService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'head' | 'priya' | 'arjun' | 'sita' | 'meena' | 'kiran' | 'hr' | 'hr2';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1/performance${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const shift = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const plan = (employeeId: string, o: Record<string, unknown> = {}) => ({ employeeId, reason: 'Order accuracy fell below the team standard for two quarters.', expectations: 'Ship orders with at most 2% errors each month.', support: 'Weekly coaching with the lead.', goals: [{ text: 'Cut order errors', measure: 'Errors at or below 2% a month' }], lengthDays: 30, checkinEveryDays: 7, startsOn: today, ...o });
  const approve = async (pipId: string) => {
    const p = await inA((tx) => tx.pip.findFirstOrThrow({ where: { id: pipId } }));
    const t = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId: p.wfRequestId!, status: 'open' } }));
    const who = (Object.keys(users) as Who[]).find((w) => users[w] === t.assigneeUserId)!;
    await request(server()).post(`/api/v1/workflow/approvals/tasks/${t.id}/decide`).set('Authorization', `Bearer ${token[who]}`).send({ decision: 'approve' }).expect(200);
    return who;
  };
  type View = { status: string; endsOn: string; plannedEndsOn: string; pausedDays: number; warning: boolean; version: number; acknowledgedAt: string | null; employeeComment: string | null; checkins: { id: string; dueOn: string; status: string; managerNote: string | null; employeeNote: string | null }[]; can: Record<string, boolean>; exitCaseId: string | null };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    pips = moduleRef.get(PerformancePipsService);
    const redis = moduleRef.get<Redis>(LOGIN_PROTECTION_REDIS);
    const ipKeys = await redis.keys('auth:otp:ip:*');
    if (ipKeys.length) await redis.del(...ipKeys);

    planId = (await prisma.plan.create({ data: { name: `pm8-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PM8 Org ${k}`, slug: `pm8-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['head', 'A', 'panel', []],
      ['priya', 'A', 'panel', []],
      ['arjun', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['meena', 'A', 'panel', []],
      ['kiran', 'A', 'panel', []],
      ['hr', 'A', 'panel', ['perf.pip.manage', 'perf.cycle.manage', 'perf.report.view', 'lifecycle.exit.manage', 'lifecycle.exit.view']],
      ['hr2', 'A', 'panel', ['perf.pip.manage', 'lifecycle.exit.manage', 'lifecycle.exit.view']],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, fn);
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: o, email: `${who}@pm8-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@pm8-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const x = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...x, name: 'Kaveri Foods Pvt Ltd', shortName: `KF${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...x, legalEntityId: ids.entity, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      for (const [k, name, code] of [['sales', 'Sales', 'SAL'], ['ops', 'Operations', 'OPS']]) {
        const deptId = randomUUID();
        ids[k] = (await tx.department.create({ data: { ...x, id: deptId, name, code, path: `/${deptId}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...x, name: 'Executive', code: 'EX' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...x, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.grade = (await tx.grade.create({ data: { ...x, name: 'G1', code: 'G1', rank: 1 } })).id;
    });
    const hire = async (who: Who, given: string, code: string, manager: string | null, dept: string) =>
      (await request(server()).post('/api/v1/people/employees').set('Authorization', `Bearer ${token.adminA}`).send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', overrideReason: 'Moving existing staff onto YukthiX', givenName: given, familyName: run, employeeCode: code, joinedOn: '2022-01-03', userId: users[who], workEmail: `${who}@pm8-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids[dept], designationId: ids.desig, gradeId: ids.grade, employmentTypeId: ids.perm, managerEmployeeId: manager } }).expect(201)).body.id as string;
    emp.head = await hire('head', 'Arun', 'KF-001', null, 'ops');
    emp.priya = await hire('priya', 'Priya', 'KF-002', emp.head, 'ops');
    emp.arjun = await hire('arjun', 'Arjun', 'KF-003', emp.priya, 'sales');
    emp.sita = await hire('sita', 'Sita', 'KF-004', emp.priya, 'sales');
    emp.meena = await hire('meena', 'Meena', 'KF-005', emp.priya, 'sales');
    emp.kiran = await hire('kiran', 'Kiran', 'KF-006', emp.head, 'ops');
    await inA(async (tx) => {
      ids.matl = (await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'MATL', name: 'Maternity', kind: 'maternity' } })).id;
      // Meena is on maternity leave now; Sita's starts in ten days.
      await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: emp.meena, leaveTypeId: ids.matl, fromOn: day(shift(today, -5)), toOn: day(shift(today, 100)), days: 106, status: 'approved' } });
    });
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('a manager cannot start a plan without HR; the employee sees nothing until it is approved (PM-8.01)', async () => {
    await api('priya', 'post', '/pips').send(plan(emp.kiran)).expect(404);
    await api('arjun', 'post', '/pips').send(plan(emp.arjun)).expect(403);
    expect((await api('priya', 'post', '/pips').send(plan(emp.arjun, { lengthDays: 45 })).expect(400)).body.message).toMatch(/30, 60, 90/);
    ids.pip = (await api('priya', 'post', '/pips').send(plan(emp.arjun)).expect(201)).body.id;
    await api('priya', 'post', '/pips').send(plan(emp.arjun)).expect(409);
    expect((await api('priya', 'get', `/pips/${ids.pip}`).expect(200)).body.status).toBe('proposed');
    await api('arjun', 'get', `/pips/${ids.pip}`).expect(404);
    expect((await api('arjun', 'get', '/pips?view=mine').expect(200)).body).toEqual([]);
    await api('kiran', 'get', `/pips/${ids.pip}`).expect(404);
    await api('adminB', 'get', `/pips/${ids.pip}`).expect(404);
    // The proposer never decides; HR does.
    const wf = (await inA((tx) => tx.pip.findUniqueOrThrow({ where: { id: ids.pip } }))).wfRequestId!;
    const task = await inA((tx) => tx.wfTask.findMany({ where: { requestId: wf, status: 'open' } }));
    expect(task.map((t) => t.assigneeUserId).sort()).toEqual([users.hr, users.hr2].sort());
    expect(await approve(ids.pip)).toMatch(/^hr2?$/);
    const v = (await api('priya', 'get', `/pips/${ids.pip}`).expect(200)).body as View;
    expect(v.status).toBe('active');
    expect(v.checkins.map((c) => c.dueOn)).toEqual([shift(today, 7), shift(today, 14), shift(today, 21), shift(today, 28), shift(today, 30)]);
    // Nobody wrote a letter template: HR is told what to add.
    expect((await api('hr', 'post', `/pips/${ids.pip}/letter`).expect(409)).body.message).toMatch(/letter template/);
  });

  it('the employee acknowledges with a comment, once; check-ins with notes; a missed one tells HR (PM-8.01, 8.02)', async () => {
    let v = (await api('arjun', 'get', `/pips/${ids.pip}`).expect(200)).body as View;
    expect(v.can.acknowledge).toBe(true);
    v = (await api('arjun', 'post', `/pips/${ids.pip}/acknowledge`).send({ comment: 'I do not agree with the error count, but I will work on it.', version: v.version }).expect(200)).body;
    expect(v.acknowledgedAt).not.toBeNull();
    expect(v.employeeComment).toMatch(/do not agree/);
    await api('arjun', 'post', `/pips/${ids.pip}/acknowledge`).send({ version: v.version }).expect(409);
    const [first, second, third] = v.checkins;
    await api('arjun', 'post', `/pips/${ids.pip}/checkins`).send({ checkinId: first.id, note: 'Me first' }).expect(409);
    await api('priya', 'post', `/pips/${ids.pip}/checkins`).send({ checkinId: second.id, note: 'Too early' }).expect(409);
    await api('priya', 'post', `/pips/${ids.pip}/checkins`).send({ checkinId: first.id, note: 'Errors down to 3%.' }).expect(200);
    v = (await api('arjun', 'post', `/pips/${ids.pip}/checkins`).send({ checkinId: first.id, note: 'The new checklist helps.' }).expect(200)).body;
    expect(v.checkins[0]).toMatchObject({ status: 'held', managerNote: 'Errors down to 3%.', employeeNote: 'The new checklist helps.' });
    await api('kiran', 'post', `/pips/${ids.pip}/checkins`).send({ checkinId: third.id, note: 'Not mine' }).expect(404);
    // The third check-in slipped: its date is moved into the past and the daily run records it.
    await inA((tx) => tx.pipCheckin.update({ where: { id: third.id }, data: { dueOn: day(shift(today, -5)) } }));
    await pips.sweepOrg(org.A.id, today);
    expect((await inA((tx) => tx.pipCheckin.findUniqueOrThrow({ where: { id: third.id } }))).status).toBe('missed');
    const told = await inA((tx) => tx.userNotification.findMany({ where: { type: { startsWith: 'perf.pip.' } } }));
    expect(told.filter((n) => n.type === 'perf.pip.checkin_missed').map((n) => n.recipientUserId)).toEqual(expect.arrayContaining([users.hr, users.hr2, users.priya]));
    expect(told.filter((n) => n.type === 'perf.pip.started').map((n) => n.recipientUserId)).toEqual([users.arjun]);
    // Told once.
    await pips.sweepOrg(org.A.id, today);
    expect(await inA((tx) => tx.userNotification.count({ where: { type: 'perf.pip.started' } }))).toBe(1);
  });

  it('no plan starts during protected leave; leave inside a plan moves its end; a blocked pair warns HR only (PM-8.02)', async () => {
    expect((await api('priya', 'post', '/pips').send(plan(emp.meena)).expect(409)).body.code).toBe('PROTECTED_LEAVE');
    // A confidential matter involves Sita (the block names no one but the pair and no case).
    await inA((tx) => tx.reviewerBlock.create({ data: { organizationId: org.A.id, employeeA: emp.sita, employeeB: emp.kiran, reasonCode: 'confidential_matter', setBy: users.hr } }));
    ids.sitaPip = (await api('priya', 'post', '/pips').send(plan(emp.sita, { lengthDays: 60, checkinEveryDays: 14 })).expect(201)).body.id;
    const warned = await inA((tx) => tx.userNotification.findMany({ where: { type: 'perf.pip.warning' } }));
    expect(warned.map((n) => n.recipientUserId).sort()).toEqual([users.hr, users.hr2].sort());
    expect(warned[0].contextText).not.toMatch(/Kiran|confidential|block/i);
    expect((await api('hr', 'get', `/pips/${ids.sitaPip}`).expect(200)).body.warning).toBe(true);
    expect((await api('priya', 'get', `/pips/${ids.sitaPip}`).expect(200)).body.warning).toBe(false);
    await approve(ids.sitaPip);
    await inA((tx) => tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: emp.sita, leaveTypeId: ids.matl, fromOn: day(shift(today, 10)), toOn: day(shift(today, 19)), days: 10, status: 'approved' } }));
    const v = (await api('sita', 'get', `/pips/${ids.sitaPip}`).expect(200)).body as View;
    expect(v.warning).toBe(false);
    expect(v.plannedEndsOn).toBe(shift(today, 60));
    expect(v).toMatchObject({ pausedDays: 10, endsOn: shift(today, 70) });
    // Check-ins that fall in the leave are not missed.
    await inA((tx) => tx.pipCheckin.updateMany({ where: { pipId: ids.sitaPip, dueOn: day(shift(today, 14)) }, data: { dueOn: day(shift(today, 12)) } }));
    await pips.sweepOrg(org.A.id, shift(today, 18));
    expect(await inA((tx) => tx.pipCheckin.count({ where: { pipId: ids.sitaPip, status: 'missed' } }))).toBe(0);
  });

  it('extend once; "not met" opens no exit by itself; HR starts an exit linked to the plan (PM-8.03)', async () => {
    let s = (await api('hr', 'get', `/pips/${ids.sitaPip}`).expect(200)).body as View;
    await api('priya', 'post', `/pips/${ids.sitaPip}/outcome`).send({ outcome: 'met', note: 'Done', version: s.version }).expect(403);
    s = (await api('hr', 'post', `/pips/${ids.sitaPip}/outcome`).send({ outcome: 'extended', note: 'More time after leave', extendTo: shift(today, 90), version: s.version }).expect(200)).body;
    expect(s.status).toBe('extended');
    expect(s.plannedEndsOn).toBe(shift(today, 90));
    expect(s.checkins.map((c) => c.dueOn)).toContain(shift(today, 90));
    expect((await api('hr', 'post', `/pips/${ids.sitaPip}/outcome`).send({ outcome: 'extended', note: 'Again', extendTo: shift(today, 120), version: s.version }).expect(400)).body.message).toMatch(/once/);
    s = (await api('hr', 'post', `/pips/${ids.sitaPip}/outcome`).send({ outcome: 'met', note: 'Accuracy is back at standard.', version: s.version }).expect(200)).body;
    expect(s.status).toBe('met');
    expect(s.checkins.some((c) => c.status === 'due')).toBe(false);

    let a = (await api('hr', 'get', `/pips/${ids.pip}`).expect(200)).body as View;
    await api('hr', 'post', `/pips/${ids.pip}/start-exit`).send({ lwd: shift(today, 30), reasonText: 'Plan not met' }).expect(409);
    a = (await api('hr', 'post', `/pips/${ids.pip}/outcome`).send({ outcome: 'not_met', note: 'Errors stayed above 5%.', version: a.version }).expect(200)).body;
    expect(a.status).toBe('not_met');
    expect(await inA((tx) => tx.exitCase.count({ where: { employeeId: emp.arjun } }))).toBe(0);
    expect(a.can.startExit).toBe(true);
    await api('priya', 'post', `/pips/${ids.pip}/start-exit`).send({ lwd: shift(today, 30), reasonText: 'Plan not met' }).expect(403);
    const out = (await api('hr', 'post', `/pips/${ids.pip}/start-exit`).send({ lwd: shift(today, 30), reasonText: 'Plan not met' }).expect(200)).body;
    const k = await inA((tx) => tx.exitCase.findUniqueOrThrow({ where: { id: out.exitCaseId } }));
    expect(k).toMatchObject({ employeeId: emp.arjun, initiatedBy: 'company', exitType: 'termination', sourceType: 'pip', sourceId: ids.pip });
    expect((await api('hr', 'get', `/pips/${ids.pip}`).expect(200)).body.exitCaseId).toBe(out.exitCaseId);
    expect((await api('arjun', 'get', `/pips/${ids.pip}`).expect(200)).body.exitCaseId).toBeNull();
    await api('hr', 'post', `/pips/${ids.pip}/start-exit`).send({ lwd: shift(today, 30), reasonText: 'Again' }).expect(409);
  });

  it('plans follow a manager change; the PIP-status report suppresses small groups; the database refuses erasing (PM-8.03)', async () => {
    const p = (await api('priya', 'post', '/pips').send(plan(emp.sita)).expect(201)).body.id as string;
    // A stale owner on a live plan is put right by the daily run, logged as a hand-over.
    await inA((tx) => tx.pip.update({ where: { id: p }, data: { managerEmployeeId: emp.kiran } }));
    await pips.sweepOrg(org.A.id, today);
    expect((await inA((tx) => tx.pip.findUniqueOrThrow({ where: { id: p } }))).managerEmployeeId).toBe(emp.priya);
    expect(await inA((tx) => tx.perfOwnerTransfer.count({ where: { artefactType: 'pip', artefactId: p } }))).toBe(1);

    await request(server()).post('/api/v1/performance/setup/from-starter').set('Authorization', `Bearer ${token.adminA}`).expect(201);
    const templates = (await api('adminA', 'get', '/templates').expect(200)).body as { id: string; kind: string }[];
    const all = { id: 'root', join: 'and', items: [{ id: 'c1', field: 'department_id', operator: 'is', value: ids.sales }] };
    const c = (await api('hr', 'post', '/cycles').send({ name: `Annual ${run}`, kind: 'annual', periodFrom: shift(today, -30), periodTo: shift(today, 300), templateId: templates.find((t) => t.kind === 'annual')!.id, population: all, stages: [{ key: 'manager', dueOn: shift(today, 10) }], eligibilityRules: { cutoffMonths: 3, rateLeavers: false } }).expect(201)).body;
    const r = (await api('hr', 'get', `/reports/pip-status?cycle=${c.id}`).expect(200)).body as { header: string[]; rows: (string | number | null)[][] };
    expect(r.header).toEqual(['department', 'active', 'extended', 'met', 'not_met', 'total']);
    // Two plans in Sales, under the smallest group of 5: shown as a hidden row, never as counts.
    expect(r.rows).toEqual([['Sales', null, null, null, null, null]]);
    await api('priya', 'get', `/reports/pip-status?cycle=${c.id}`).expect(403);

    await expect(inA((tx) => tx.$executeRaw`DELETE FROM pip_checkins WHERE pip_id = ${ids.pip}::uuid`)).rejects.toThrow(/permission denied/);
    await expect(inA((tx) => tx.$executeRaw`DELETE FROM pips WHERE id = ${ids.pip}::uuid`)).rejects.toThrow(/permission denied/);
  });
});
