import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { BlobStorageService, OrgSecretsCryptoService, PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ROLE_TEMPLATES } from '../src/access/role-templates';
import { loadRuleSets, type RuleFileSet } from '../src/statutory/load-rule-file';
import { StatutoryRulesService } from '../src/statutory/statutory.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// Fix (late corrections paid; PAY-1.03 / 1.04, YX-LOCK-03): an attendance correction approved after its month locked
// is paid by the next regular run as an LOP reversal at the locked month's pay, under the same components (PF, ESI and
// tax follow), listed on the run's corrections panel; "Not paid" with a reason takes it out and Undo puts it back.
// Its own company and person: the batch 5g suite exits its people later, so the months here stay apart.
describe('Payroll: late corrections paid in the next run', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'payAdmin' | 'approver1' | 'approver2' | 'emp1' | 'emp2' | 'emp3' | 'payAdminB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const scoped = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) =>
    inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return fn(tx);
    });
  const stepUp = (who: Who) => markSteppedUp(tenantPrisma, token[who]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (d: string, n: number) => iso(new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86_400_000));
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const first = `${month}-01`;
  const prevMonth = iso(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1))).slice(0, 7);
  const prevFirst = `${prevMonth}-01`;
  const short = () => `PLC-${run}`.toUpperCase();

  /** Waive missing bank details and calculate. */
  const calculate = async (runId: string) => {
    const ready = (await api('payAdmin', 'get', `/payroll/runs/${runId}/readiness`).expect(200)).body;
    for (const b of ready.checks.filter((c: { checkKey: string; waived: boolean }) => c.checkKey === 'bank_missing' && !c.waived))
      await api('payAdmin', 'post', `/payroll/runs/${runId}/validations/${b.id}/waive`).send({ reason: 'Bank details come next week' }).expect(200);
    await api('payAdmin', 'post', `/payroll/runs/${runId}/calculate`).expect(202);
    let r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    for (let i = 0; i < 160 && r.status === 'calculating'; i++) {
      await new Promise((ok) => setTimeout(ok, 250));
      r = (await api('payAdmin', 'get', `/payroll/runs/${runId}`)).body;
    }
    if (r.status !== 'calculated') throw new Error(`run ${runId}: ${JSON.stringify((await api('payAdmin', 'get', `/payroll/runs/${runId}/progress`)).body)}`);
    return r;
  };
  /** Calculate, submit, and both approvers approve with the phrase. */
  const approveRun = async (runId: string) => {
    const r = await calculate(runId);
    // A second month flags pay changes against the first; payroll confirms them before submitting.
    for (const f of (await api('payAdmin', 'get', `/payroll/runs/${runId}/variances`).expect(200)).body as { id: string }[]) await api('payAdmin', 'post', `/payroll/runs/${runId}/variances/${f.id}/ack`).send({}).expect(200);
    const sent = await api('payAdmin', 'post', `/payroll/runs/${runId}/submit`).send({});
    if (sent.status !== 200) throw new Error(`submit ${runId}: ${sent.status} ${JSON.stringify(sent.body)}`);
    for (const who of ['approver1', 'approver2'] as const) {
      await stepUp(who);
      await api(who, 'post', `/payroll/runs/${runId}/decision`)
        .send({ decision: 'approve', confirmation: { phrase: `APPROVE ${short()} ${r.month}`, impact: [] } })
        .expect(200);
    }
    return (await api('payAdmin', 'get', `/payroll/runs/${runId}/payslips`).expect(200)).body as { id: string; employeeId: string; net: string; held: boolean; status: string }[];
  };
  const linesOf = (payslipId: string) => api('payAdmin', 'get', `/payroll/payslips/${payslipId}`).expect(200);

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
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.is_super_admin', 'on', true)`;
      const staff = async (email: string) => (await tx.user.findFirstOrThrow({ where: { email, organizationId: null } })).id;
      const pack = (f: string) => (JSON.parse(readFileSync(join(__dirname, '..', 'src', 'statutory', 'packs', f), 'utf8')) as { ruleSets: RuleFileSet[] }).ruleSets;
      await loadRuleSets(tx, [...pack('in-tax.json'), ...pack('in-exit.json'), ...pack('in-bank-formats.json')], await staff('super@platform.test'), await staff('rules@platform.test'));
    });
    (moduleRef.get(StatutoryRulesService) as unknown as { cache: null }).cache = null;
    planId = (await prisma.plan.create({ data: { name: `paylate-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `PayLate Org ${k}`, slug: `paylate-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    // Founder 21 Oct 2026 (option A): only HR changes pay. These pay tests' payroll fixture also plays the HR person who
    // sets the pay (the job-change key); payroll itself is refused a pay change (people-increment.e2e-spec.ts).
    // Founder 28 Oct 2026: only HR approves job changes; the approver fixture also plays the HR approver who sees pay
    // (payroll itself is refused: employee-history.e2e-spec.ts).
    const template = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions, ...(key === 'payroll_admin' ? ['employee.change.manage'] : key === 'payroll_approver' ? ['employee.change.approve'] : [])];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, readonly string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['payAdmin', 'A', 'panel', [...template('payroll_admin'), 'employee.change.retro']],
      ['approver1', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['approver2', 'A', 'panel', [...template('payroll_approver'), 'employee.change.retro']],
      ['emp1', 'A', 'panel', null],
      ['emp2', 'A', 'panel', null],
      ['emp3', 'A', 'panel', null],
      ['payAdminB', 'B', 'panel', template('payroll_admin')],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys
        ? (
            await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
              tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }),
            )
          ).id
        : null;
      users[who] = (
        await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) =>
          tx.user.create({ data: { organizationId: o, email: `${who}@paylate-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }),
        )
      ).id;
      token[who] = (
        await request(server())
          .post('/api/v1/auth/staff/login')
          .send({ organizationSlug: org[k].slug, email: `${who}@paylate-${run}.test`, password: PASSWORD })
          .expect(200)
      ).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'PayLate Mills', shortName: `PLC-${run}`, isDefault: true } })).id;
      ids.loc = (
        await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata', minWageZone: '1' } })
      ).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Finance', code: 'FIN', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Analyst', code: 'AN' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
    });
    const hire = async (who: Who, code: string, joinedOn: string) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({
            legalEntityId: ids.entity,
            status: 'confirmed',
            reason: 'Joined',
            givenName: who,
            familyName: run,
            employeeCode: code,
            joinedOn,
            userId: users[who],
            workEmail: `${who}@paylate-${run}.test`,
            assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: null },
          })
          .expect(201)
      ).body.id as string;
    ids.emp1 = await hire('emp1', 'PLC-001', first);
    ids.emp2 = await hire('emp2', 'PLC-002', first);
    ids.emp3 = await hire('emp3', 'PLC-003', prevFirst);
    await api('payAdmin', 'post', '/payroll/components/starter').expect(201);
    ids.version = ((await api('payAdmin', 'get', '/payroll/templates').expect(200)).body as { versions: { id: string }[] }[])[0].versions[0].id;
    ids.group = (await api('payAdmin', 'post', '/payroll/pay-groups').send({ legalEntityId: ids.entity, name: 'Monthly', cutOffDay: 25, payDay: 0 }).expect(201)).body.id;
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp1, ids.emp2], from: first })
      .expect(201);
    await api('payAdmin', 'post', `/payroll/pay-groups/${ids.group}/members`)
      .send({ employeeIds: [ids.emp3], from: prevFirst })
      .expect(201);
    for (const [emp, ctc, from] of [
      [ids.emp1, '600000', first],
      [ids.emp2, '240000', first],
      [ids.emp3, '360000', prevFirst],
    ]) {
      const ch = (
        await api('payAdmin', 'post', `/payroll/employees/${emp}/compensation-changes`)
          .send({ employeeId: emp, effectiveDate: from, templateVersionId: ids.version, entryMode: 'ctc', annualCtc: ctc, reason: 'Joining salary' })
          .expect(201)
      ).body;
      await stepUp('approver1');
      await api('approver1', 'post', `/people/changes/${ch.changeId}/approve`).send({ confirmRebase: true }).expect(201);
    }
    ids.run = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month }).expect(201)).body.id;
    await approveRun(ids.run);
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.payPeriod.updateMany({ where: { organizationId: { in: [org.A.id, org.B.id] } }, data: { stage: 'open' } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // Fix (late corrections paid): an approved late correction for a locked month is paid by the next regular run, as an
  // LOP reversal at the locked month's rates under the same components (so PF, ESI and tax follow), listed on the run's
  // corrections panel; "Not paid" with a reason still takes it out.
  it('a late correction approved after the month locked is paid in the next regular run; Not paid takes it out', async () => {
    const after = (m: string) => iso(new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5)), 1))).slice(0, 7);
    const m1 = after(month);
    const m2 = after(m1);
    const absentOn = `${m1}-05`;
    // emp3 was absent on the 5th (one LOP day); m1 is paid and locked with that day unpaid.
    await inA((tx) => tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: ids.emp3, workOn: new Date(`${absentOn}T00:00:00Z`), mode: 'punch', status: 'absent' } }));
    // Answer 2300 (the next test): emp2 was absent on the 9th too, paid as one LOP day in the locked month.
    await inA((tx) => tx.attendanceDay.create({ data: { organizationId: org.A.id, employeeId: ids.emp2, workOn: new Date(`${m1}-09T00:00:00Z`), mode: 'punch', status: 'absent' } }));
    ids.m1 = m1;
    const run1 = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month: m1 }).expect(201)).body.id as string;
    const slips1 = await approveRun(run1);
    const s1 = slips1.find((x) => x.employeeId === ids.emp3)!;
    const lop1 = (await linesOf(s1.id)).body.lines as { code: string; amount: string; explanation: string }[];
    expect(lop1.find((l) => l.code === 'basic')!.explanation).toMatch(/less 1\.00 unpaid days/);
    const p1 = await inA((tx) => tx.payPeriod.findFirstOrThrow({ where: { organizationId: org.A.id, legalEntityId: ids.entity, periodStart: new Date(`${m1}-01T00:00:00Z`) } }));
    expect(['locked', 'filed']).toContain(p1.stage);
    // The gate reader missed them: the correction is approved after the lock and waits for the next open month (m2).
    const cid = (
      await scoped((tx) =>
        tx.payCorrection.create({
          data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp3, payPeriodId: p1.id, workOn: new Date(`${absentOn}T00:00:00Z`), kind: 'attendance', source: 'late_request', change: { shouldBe: 'present' }, reason: 'The gate reader missed me', status: 'approved', decidedAt: new Date(), targetPeriod: new Date(`${m2}-01T00:00:00Z`), createdBy: users.emp3 },
        }),
      )
    ).id;
    const run2 = (await api('payAdmin', 'post', '/payroll/runs').send({ payGroupId: ids.group, month: m2 }).expect(201)).body.id as string;
    const reversal = async () => {
      await calculate(run2);
      const s2 = ((await api('payAdmin', 'get', `/payroll/runs/${run2}/payslips`).expect(200)).body as { id: string; employeeId: string }[]).find((x) => x.employeeId === ids.emp3)!;
      return ((await linesOf(s2.id)).body.lines as { code: string; kind: string; amount: string; explanation: string }[]).filter((l) => /late correction/.test(l.explanation));
    };
    const paid = await reversal();
    // Paid back under the same components as the locked month's LOP cut (basic and the prorated allowances).
    expect(paid.length).toBeGreaterThan(0);
    expect(paid.find((l) => l.code === 'basic')).toMatchObject({ kind: 'earning', explanation: expect.stringContaining(absentOn) });
    const total = paid.reduce((t, l) => t + Number(l.amount), 0);
    expect(total).toBeGreaterThan(0);
    // The run's corrections panel lists it; Not paid with a reason takes it out of the next calculation.
    const card = (await api('payAdmin', 'get', `/payroll/runs/${run2}/special-days`).expect(200)).body;
    expect(card.corrections).toEqual([expect.objectContaining({ id: cid, employeeId: ids.emp3, month: m1 })]);
    // Negative: no reason, another company, and the employee are refused; nothing changes.
    await api('payAdmin', 'post', `/payroll/runs/${run2}/special-days/corrections/${cid}/not-paid`).send({}).expect(400);
    await api('payAdminB', 'post', `/payroll/runs/${run2}/special-days/corrections/${cid}/not-paid`).send({ reason: 'Paid by cash at the site office' }).expect(404);
    await api('emp3', 'post', `/payroll/runs/${run2}/special-days/corrections/${cid}/not-paid`).send({ reason: 'Paid by cash at the site office' }).expect(403);
    await api('payAdmin', 'post', `/payroll/runs/${run2}/special-days/corrections/${cid}/not-paid`).send({ reason: 'Paid by cash at the site office' }).expect(201);
    expect((await api('payAdmin', 'get', `/payroll/runs/${run2}/special-days`).expect(200)).body.notPaid).toEqual([expect.objectContaining({ id: cid, reason: 'Paid by cash at the site office' })]);
    expect(await reversal()).toEqual([]);
    await api('payAdmin', 'post', `/payroll/runs/${run2}/special-days/corrections/${cid}/undo-not-paid`).send({}).expect(201);
    expect((await reversal()).length).toBe(paid.length);
  });

  // Answer 2300: the leaver's full and final settlement was settled before the correction was approved: payroll adds it
  // to an off-cycle correction run of the month of the last day in one click; it is paid there, once.
  it('F&F settled first: listed so, one click adds it to an off-cycle correction run that pays it; refused when not settled, twice, or by others', async () => {
    const m1 = ids.m1!;
    const em = await inA((tx) => tx.employment.findFirstOrThrow({ where: { organizationId: org.A.id, employeeId: ids.emp2 } }));
    const person = await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: ids.emp2 } }));
    await inA((tx) => tx.employment.update({ where: { id: em.id }, data: { exitedOn: new Date(`${m1}-28T00:00:00Z`) } }));
    const fnfId = await scoped(async (tx) => {
      const exit = await tx.exitCase.create({ data: { organizationId: org.A.id, employmentId: em.id, employeeId: ids.emp2, personId: person.personId!, exitType: 'resignation', initiatedBy: 'employee', reasonText: 'Moved city', submittedOn: new Date(`${m1}-01T00:00:00Z`), noticePeriod: '0d', standardLwd: new Date(`${m1}-28T00:00:00Z`), approvedLwd: new Date(`${m1}-28T00:00:00Z`), status: 'accepted', acceptedAt: new Date() } });
      return (await tx.fnfSettlement.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp2, employmentId: em.id, exitCaseId: exit.id, exitType: 'resignation', inputRevision: 1, lwd: new Date(`${m1}-28T00:00:00Z`), deadline: new Date(`${m1}-30T00:00:00Z`), status: 'open' } })).id;
    });
    const p1 = await inA((tx) => tx.payPeriod.findFirstOrThrow({ where: { organizationId: org.A.id, legalEntityId: ids.entity, periodStart: new Date(`${m1}-01T00:00:00Z`) } }));
    // Approved after the lock, for the month of the last day (answer 2283).
    const cid = (await scoped((tx) => tx.payCorrection.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: ids.emp2, payPeriodId: p1.id, workOn: new Date(`${m1}-09T00:00:00Z`), kind: 'attendance', source: 'hr', change: { shouldBe: 'present' }, reason: 'Was at the client site all day', status: 'approved', decidedAt: new Date(), targetPeriod: new Date(`${m1}-01T00:00:00Z`), createdBy: users.adminA } }))).id;
    const add = (who: Who) => api(who, 'post', `/payroll/corrections/${cid}/offcycle`).send({});
    // Not settled yet: the F&F pays it; nothing is added.
    expect((await add('payAdmin').expect(409)).body.message).toMatch(/not settled/);
    expect((await api('payAdmin', 'get', '/payroll/corrections/waiting-fnf').expect(200)).body.find((x: { id: string }) => x.id === cid)).toMatchObject({ state: 'waiting', fnfId });
    await scoped((tx) => tx.fnfSettlement.update({ where: { id: fnfId }, data: { status: 'settled' } }));
    expect((await api('payAdmin', 'get', '/payroll/corrections/waiting-fnf').expect(200)).body.find((x: { id: string }) => x.id === cid)).toMatchObject({ state: 'settled', month: m1 });
    // Negative: an employee and another company.
    await add('emp2').expect(403);
    await add('payAdminB').expect(404);
    const out = (await add('payAdmin').expect(200)).body as { runId: string; items: number };
    expect(out.items).toBeGreaterThan(0);
    const run = await scoped((tx) => tx.payrollRun.findUniqueOrThrow({ where: { id: out.runId } }));
    expect([run.runType, run.offcycleKind, run.periodStart.toISOString().slice(0, 7)]).toEqual(['offcycle', 'correction', m1]);
    expect(await scoped((tx) => tx.oneTimePay.count({ where: { organizationId: org.A.id, runId: out.runId, sourceRef: cid, status: 'approved' } }))).toBe(out.items);
    // Once: a second click is refused; it is no longer listed.
    expect((await add('payAdmin').expect(409)).body.message).toMatch(/already in an off-cycle run/);
    expect((await api('payAdmin', 'get', '/payroll/corrections/waiting-fnf').expect(200)).body.find((x: { id: string }) => x.id === cid)).toBeUndefined();
    // The off-cycle run pays it: the leaver's payslip carries the late correction under basic.
    await calculate(out.runId);
    const slip = ((await api('payAdmin', 'get', `/payroll/runs/${out.runId}/payslips`).expect(200)).body as { id: string; employeeId: string }[]).find((x) => x.employeeId === ids.emp2)!;
    const lines = (await linesOf(slip.id)).body.lines as { code: string; amount: string; explanation: string }[];
    expect(lines.find((l) => l.code === 'basic' && /late correction/.test(l.explanation))).toBeTruthy();
    expect(Number(lines.find((l) => l.code === 'basic')!.amount)).toBeGreaterThan(0);
  });
});
