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
import { AutomationService } from '../src/rules-engine/automation.service';
import { addDays } from '../src/lifecycle/journey-rules';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';

// Lifecycle batch 6c end to end against the real database (forced RLS, the app role): the notice from the policy in
// force on the day, a resignation accepted by the manager then HR (on notice, the offboarding checklist on the last day,
// clearance and the exit interview), an early release that moves the checklist, withdrawals before and after
// acceptance, company exits (refused during maternity leave; death with no interview), HR-only facts the manager never
// sees (API and raw query), the leaver's neutral hold message, the probation review (extend within the maximum, end the
// probation after HR), clearance owners, recoveries and "cleared", exit interview answers kept from the manager, the
// asset list (one open assignment per asset, acknowledgement, return), and two companies apart.

describe('Lifecycle batch 6c', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'hr' | 'hr2' | 'mgr' | 'it' | 'ravi' | 'sita' | 'arun' | 'meena' | 'kiran';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const emp = {} as Record<string, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const email = { send: jest.fn(async () => ({ success: true })) };
  const inA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, fn);
  const decide = async (who: Who, decision: 'approve' | 'reject' = 'approve') => {
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { assigneeUserId: users[who], status: 'open' }, orderBy: { createdAt: 'desc' } }));
    await api(who, 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision }).expect(200);
  };
  const statusToday = (employeeId: string) =>
    inA(async (tx) => {
      const e = await tx.employment.findFirstOrThrow({ where: { employeeId } });
      return (await tx.employmentStatusPeriod.findFirstOrThrow({ where: { employmentId: e.id, supersededAt: null, validFrom: { lte: new Date(`${today}T00:00:00Z`) }, OR: [{ validTo: null }, { validTo: { gte: new Date(`${today}T00:00:00Z`) } }] } })).status;
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(BlobStorageService).useValue(createFakeBlobStorage()).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    automation = moduleRef.get(AutomationService);

    planId = (await prisma.plan.create({ data: { name: `life6c-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Life6C Org ${k}`, slug: `life6c-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const tpl = (key: string) => [...ROLE_TEMPLATES.find((t) => t.key === key)!.permissions];
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string[] | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['hr', 'A', 'panel', [...tpl('hr_admin'), 'asset.manage']],
      ['hr2', 'A', 'panel', tpl('hr_admin')],
      ['it', 'A', 'panel', tpl('it_admin_coordinator')],
      ['mgr', 'A', 'panel', []],
      ['ravi', 'A', 'panel', []],
      ['sita', 'A', 'panel', []],
      ['arun', 'A', 'panel', []],
      ['meena', 'A', 'panel', []],
      ['kiran', 'A', 'panel', []],
    ];
    for (const [who, k, role, keys] of roster) {
      const o = org[k].id;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@life6c-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@life6c-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await inA(async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'Exit Foods Pvt Ltd', shortName: `EX${run.slice(0, 4).toUpperCase()}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      const deptId = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...o, id: deptId, name: 'Production', code: 'PROD', path: `/${deptId}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Operator', code: 'OP' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      // The notice policy is dated (YX-LC-04): 45 days today, 2 months from tomorrow.
      await tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'exit.notice.confirmed', value: '45d', validFrom: new Date('2026-01-01T00:00:00Z') } });
      await tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'exit.notice.confirmed', value: '2m', validFrom: new Date(`${addDays(today, 1)}T00:00:00Z`) } });
    });
    const hire = async (who: Who | 'none', given: string, code: string, status: 'confirmed' | 'probation', joinedOn: string, manager: string | null) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status, reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn, userId: who === 'none' ? undefined : users[who], workEmail: who === 'none' ? `${code.toLowerCase()}@life6c-${run}.test` : `${who}@life6c-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } }).then((r) => { if (r.status !== 201) throw new Error(`hire ${code}: ${JSON.stringify(r.body)}`); return r; })).body.id as string;
    emp.mgr = await hire('mgr', 'Divya', 'EX-001', 'confirmed', '2026-04-06', null);
    emp.ravi = await hire('ravi', 'Ravi', 'EX-002', 'confirmed', '2026-04-06', emp.mgr);
    emp.sita = await hire('sita', 'Sita', 'EX-003', 'confirmed', '2026-04-06', emp.mgr);
    emp.arun = await hire('arun', 'Arun', 'EX-004', 'probation', addDays(today, -60), emp.mgr);
    emp.meena = await hire('meena', 'Meena', 'EX-005', 'confirmed', '2026-04-06', emp.mgr);
    emp.kiran = await hire('kiran', 'Kiran', 'EX-006', 'confirmed', '2026-04-06', emp.mgr);
    await api('adminA', 'post', '/lifecycle/journey-templates/from-starter').send({ starterKey: 'offboarding_standard' }).expect(201);
  }, 240_000);

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

  it('assets: HR adds and issues them; one open assignment per asset (database); the holder acknowledges', async () => {
    const add = async (tag: string, name: string, cost: string) => (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name, tag, legalEntityId: ids.entity, locationId: ids.blr, cost }).expect(201)).body.id as string;
    ids.laptop = await add(`LT-${run}`, 'ThinkPad E14', '62000.00');
    ids.phone = await add(`PH-${run}`, 'Galaxy A35', '15000.00');
    await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Dup', tag: `lt-${run}` }).expect(409);
    await api('ravi', 'get', '/lifecycle/assets').expect(403);
    for (const a of [ids.laptop, ids.phone]) await api('hr', 'post', `/lifecycle/assets/${a}/issue`).send({ employeeId: emp.ravi, issuedOn: today, condition: 'New' }).expect(200);
    await api('hr', 'post', `/lifecycle/assets/${ids.laptop}/issue`).send({ employeeId: emp.sita, issuedOn: today, condition: 'New' }).expect(409);
    const person = await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.sita } }));
    await expect(inA((tx) => tx.assetAssignment.create({ data: { organizationId: org.A.id, assetId: ids.laptop, personId: person.personId, issuedOn: new Date(`${today}T00:00:00Z`), issueCondition: 'x' } }))).rejects.toThrow();
    const mine = (await api('ravi', 'get', '/lifecycle/me/assets').expect(200)).body.rows;
    expect(mine).toHaveLength(2);
    await api('ravi', 'post', `/lifecycle/me/assets/${mine[0].assignmentId}/acknowledge`).expect(200);
    await api('sita', 'post', `/lifecycle/me/assets/${mine[1].assignmentId}/acknowledge`).expect(404);
    const list = (await api('hr', 'get', '/lifecycle/assets').expect(200)).body.rows;
    expect(list.find((r: { id: string }) => r.id === ids.laptop).holder.name).toMatch(/Ravi/);
  });

  it('resignation: notice from the policy in force today; the manager then HR accept; on notice with checklist, clearance and interview', async () => {
    const before = (await api('ravi', 'get', '/lifecycle/me/resignation').expect(200)).body;
    expect(before.notice).toMatchObject({ period: '45d', standardLwd: addDays(today, 45) });
    const r = (await api('ravi', 'post', '/lifecycle/me/resignation').send({ reasonCode: 'better_opportunity', reasonText: 'Moving to a role closer to home.' }).expect(201)).body;
    ids.raviCase = r.id;
    expect(r.current).toMatchObject({ status: 'submitted', standardLwd: addDays(today, 45) });
    await api('ravi', 'post', '/lifecycle/me/resignation').send({ reasonCode: 'other', reasonText: 'Again' }).expect(409);
    // D8: the manager reads the reason; HR-only facts are not there for them.
    const m = (await api('mgr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    expect(m.reasonText).toMatch(/closer to home/);
    expect(m.hr).toBeNull();
    await decide('mgr');
    expect((await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body.status).toBe('submitted');
    const hrTask = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { status: 'open', assigneeUserId: { in: [users.hr, users.hr2] } } }));
    await api(hrTask.assigneeUserId === users.hr ? 'hr' : 'hr2', 'post', `/workflow/approvals/tasks/${hrTask.id}/decide`).send({ decision: 'approve' }).expect(200);
    const k = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    expect(k).toMatchObject({ status: 'accepted', approvedLwd: addDays(today, 45), interview: 'sent' });
    expect(k.hr.openCaseFlags).toEqual({ posh: 'not_checked', disciplinary: 'not_checked', pip: 'not_checked' });
    expect(k.clearance.map((i: { department: string }) => i.department).sort()).toEqual(['admin', 'asset', 'asset', 'finance', 'hr', 'it', 'manager_handover']);
    expect(await statusToday(emp.ravi)).toBe('notice');
    const j = await inA((tx) => tx.journey.findFirstOrThrow({ where: { subjectType: 'exit_case', subjectId: ids.raviCase } }));
    expect(j.anchorOn.toISOString().slice(0, 10)).toBe(addDays(today, 45));
    expect(await inA((tx) => tx.eventOutbox.count({ where: { eventType: 'exit.case.accepted', payload: { path: ['exitCaseId'], equals: ids.raviCase } } }))).toBe(1);
  });

  it('early release moves the last day and the checklist; exit.lwd.changed once; only another HR person approves', async () => {
    const k = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    const lwd = addDays(today, 30);
    await api('mgr', 'post', `/lifecycle/exits/${ids.raviCase}/notice`).send({ kind: 'early_release', lwd, reason: 'Handover done early', version: k.version }).expect(403);
    await api('hr', 'post', `/lifecycle/exits/${ids.raviCase}/notice`).send({ kind: 'early_release', lwd: addDays(today, 60), reason: 'x x x', version: k.version }).expect(400);
    await api('hr', 'post', `/lifecycle/exits/${ids.raviCase}/notice`).send({ kind: 'early_release', lwd, reason: 'Handover done early', version: k.version }).expect(201);
    expect(await inA((tx) => tx.wfTask.count({ where: { assigneeUserId: users.hr, status: 'open' } }))).toBe(0);
    await decide('hr2');
    const after = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    expect(after.approvedLwd).toBe(lwd);
    expect(after.noticeArrangement[0]).toMatchObject({ kind: 'early_release', to: lwd });
    const j = await inA((tx) => tx.journey.findFirstOrThrow({ where: { subjectType: 'exit_case', subjectId: ids.raviCase } }));
    expect(j.anchorOn.toISOString().slice(0, 10)).toBe(lwd);
    expect(await inA((tx) => tx.eventOutbox.count({ where: { eventType: 'exit.lwd.changed', payload: { path: ['exitCaseId'], equals: ids.raviCase } } }))).toBe(1);
  });

  it('clearance: owners see only their items; a return clears its item; a lost asset becomes a recovery; all done → cleared', async () => {
    const mgrItems = (await api('mgr', 'get', '/lifecycle/clearance/mine').expect(200)).body.rows;
    expect(mgrItems.map((i: { department: string }) => i.department)).toEqual(['manager_handover']);
    await api('ravi', 'get', '/lifecycle/clearance/mine').expect(200).expect((r) => expect(r.body.rows).toHaveLength(0));
    const handover = mgrItems[0];
    await api('ravi', 'post', `/lifecycle/clearance/${handover.id}/sign-off`).send({ action: 'clear', version: handover.version }).expect(404);
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/sign-off`).send({ action: 'waive', version: handover.version }).expect(400);
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/sign-off`).send({ action: 'clear', note: 'All files moved', version: handover.version }).expect(200);
    await api('hr', 'post', `/lifecycle/assets/${ids.laptop}/return`).send({ returnedOn: today, condition: 'Good', status: 'in_stock' }).expect(200);
    await api('hr', 'post', `/lifecycle/assets/${ids.phone}/return`).send({ returnedOn: today, condition: 'Not handed back', status: 'lost' }).expect(200);
    let k = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    const laptopItem = k.clearance.find((i: { title: string }) => i.title.includes('ThinkPad'));
    const phoneItem = k.clearance.find((i: { title: string }) => i.title.includes('Galaxy'));
    expect(laptopItem.status).toBe('cleared');
    expect(phoneItem.status).toBe('open');
    await api('hr', 'post', `/lifecycle/clearance/${phoneItem.id}/sign-off`).send({ action: 'clear', recoveryAmount: '15000.00', version: phoneItem.version }).expect(400);
    await api('hr', 'post', `/lifecycle/clearance/${phoneItem.id}/sign-off`).send({ action: 'clear', recoveryAmount: '15000.00', recoveryReason: 'Phone not returned (book value)', version: phoneItem.version }).expect(200);
    for (const i of k.clearance.filter((x: { status: string; department: string }) => x.status === 'open' && x.department !== 'asset' && x.department !== 'manager_handover')) {
      await api('hr', 'post', `/lifecycle/clearance/${i.id}/sign-off`).send({ action: 'clear', version: i.version }).expect(200);
    }
    k = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    expect(k.status).toBe('cleared');
    expect(k.clearance.find((i: { id: string }) => i.id === phoneItem.id)).toMatchObject({ recoveryAmount: '15000.00' });
  });

  it('exit interview: the answers stay HR-only; the manager learns only that it is done (API and raw query)', async () => {
    const form = (await api('ravi', 'get', '/lifecycle/me/exit-interview').expect(200)).body;
    expect(form.status).toBe('sent');
    await api('ravi', 'put', '/lifecycle/me/exit-interview').send({ answers: { main_reason: 'manager' } }).expect(400);
    await api('ravi', 'put', '/lifecycle/me/exit-interview').send({ answers: { main_reason: 'manager', would_return: 'no', rating: 2, change: 'Fewer late calls' } }).expect(200);
    await api('ravi', 'put', '/lifecycle/me/exit-interview').send({ answers: { main_reason: 'manager', would_return: 'no', rating: 2 } }).expect(409);
    const m = (await api('mgr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    expect(m.interview).toBe('submitted');
    expect(JSON.stringify(m)).not.toMatch(/Fewer late calls|"main_reason"/);
    await api('mgr', 'get', `/lifecycle/exits/${ids.raviCase}/interview`).expect(403);
    await api('ravi', 'get', `/lifecycle/exits/${ids.raviCase}/interview`).expect(403);
    expect(await inA((tx) => tx.exitInterviewAnswers.count())).toBe(0);
    const hr = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}/interview`).expect(200)).body;
    expect(hr.answers).toMatchObject({ main_reason: 'manager', rating: 2 });
    await api('hr', 'put', `/lifecycle/exits/${ids.raviCase}/interview`).send({ notes: 'Spoke to the manager' }).expect(200);
  });

  it('withdrawal: alone before acceptance; after acceptance the manager and HR decide, the notice ends and the checklist stops', async () => {
    await api('sita', 'post', '/lifecycle/me/resignation').send({ reasonCode: 'family', reasonText: 'Family reasons for now.' }).expect(201);
    expect((await api('sita', 'post', '/lifecycle/me/resignation/withdraw').send({ reason: 'Changed my mind' }).expect(200)).body.result).toBe('withdrawn');
    expect(await inA((tx) => tx.wfTask.count({ where: { assigneeUserId: users.mgr, status: 'open' } }))).toBe(0);
    const r = (await api('sita', 'post', '/lifecycle/me/resignation').send({ reasonCode: 'family', reasonText: 'Family reasons after all.' }).expect(201)).body;
    await decide('mgr');
    await decide('hr');
    expect(await statusToday(emp.sita)).toBe('notice');
    expect((await api('sita', 'post', '/lifecycle/me/resignation/withdraw').send({ reason: 'Family sorted it out' }).expect(200)).body.result).toBe('requested');
    await decide('mgr');
    await decide('hr');
    const k = (await api('hr', 'get', `/lifecycle/exits/${r.id}`).expect(200)).body;
    expect(k.status).toBe('withdrawn');
    expect(k.clearance.every((i: { status: string }) => i.status === 'waived')).toBe(true);
    expect(await statusToday(emp.sita)).toBe('confirmed');
    expect((await inA((tx) => tx.journey.findFirstOrThrow({ where: { subjectType: 'exit_case', subjectId: r.id } }))).status).toBe('cancelled');
    expect(await inA((tx) => tx.eventOutbox.count({ where: { eventType: 'exit.case.withdrawn', payload: { path: ['exitCaseId'], equals: r.id } } }))).toBe(1);
  });

  it('company exits: refused during maternity leave; HR-only flags never reach the manager (API, raw query); the leaver sees a neutral hold', async () => {
    await inA(async (tx) => {
      const lt = await tx.leaveType.create({ data: { organizationId: org.A.id, code: 'MATL', name: 'Maternity', kind: 'maternity' } });
      await tx.leaveRequest.create({ data: { organizationId: org.A.id, employeeId: emp.meena, leaveTypeId: lt.id, fromOn: new Date(`${addDays(today, -10)}T00:00:00Z`), toOn: new Date(`${addDays(today, 100)}T00:00:00Z`), days: 110, status: 'approved' } });
    });
    const term = await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.meena, exitType: 'termination', lwd: addDays(today, 30), reasonText: 'Role closed' }).expect(409);
    expect(term.body.code).toBe('MATERNITY_LEAVE');
    await api('mgr', 'post', '/lifecycle/exits').send({ employeeId: emp.kiran, exitType: 'retirement', lwd: addDays(today, 30), reasonText: 'Retires' }).expect(403);
    const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.meena, exitType: 'end_of_contract', lwd: addDays(today, 120), reasonText: 'Fixed-term contract ends' }).expect(201)).body;
    expect(k.status).toBe('accepted');
    // HR records an open POSH case flag and a hold (HR-only).
    await tenantPrisma.forTenant({ organizationId: org.A.id, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.lifecycle_confidential', 'on', true)`;
      await tx.exitCaseHr.update({ where: { exitCaseId: k.id }, data: { openCaseFlags: { posh: 'open', disciplinary: 'not_checked', pip: 'not_checked' } } });
    });
    await api('hr', 'put', `/lifecycle/exits/${k.id}/hr`).send({ hold: true, version: k.version }).expect(400);
    await api('hr', 'put', `/lifecycle/exits/${k.id}/hr`).send({ hold: true, holdReason: 'Open POSH inquiry', rehireEligible: false, version: k.version }).expect(200);
    const asMgr = (await api('mgr', 'get', `/lifecycle/exits/${k.id}`).expect(200)).body;
    expect(asMgr.hr).toBeNull();
    expect(JSON.stringify(asMgr)).not.toMatch(/posh|POSH/);
    await api('mgr', 'put', `/lifecycle/exits/${k.id}/hr`).send({ hold: false, version: asMgr.version }).expect(403);
    expect(await inA((tx) => tx.exitCaseHr.count())).toBe(0);
    expect((await api('hr', 'get', `/lifecycle/exits/${k.id}`).expect(200)).body.hr).toMatchObject({ openCaseFlags: { posh: 'open' }, holdReason: 'Open POSH inquiry', rehireEligible: false });
    const mine = (await api('meena', 'get', '/lifecycle/me/resignation').expect(200)).body;
    expect(mine.current).toMatchObject({ lettersHeld: true, reasonText: null });
    expect(JSON.stringify(mine)).not.toMatch(/POSH|inquiry/);
    // Death in service: a past day, recorded at once, no exit interview.
    const d = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: emp.kiran, exitType: 'death', lwd: addDays(today, -1), reasonText: 'Passed away' }).expect(201)).body;
    expect(d).toMatchObject({ status: 'accepted', interview: null, lastDay: addDays(today, -1) });
  });

  it('probation review: the manager extends within the maximum; ending it opens an exit another HR person approves', async () => {
    const list = (await api('mgr', 'get', '/people/probations').expect(200)).body.rows;
    expect(list.find((r: { employeeId: string }) => r.employeeId === emp.arun).canReview).toBe(true);
    await api('ravi', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 2, comments: 'Needs more time' }).expect(404);
    await api('arun', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'confirm', comments: 'I am great' }).expect(403);
    expect((await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 12, comments: 'Too long' }).expect(400)).body.message).toMatch(/at most 12 months/);
    await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 2, comments: 'Needs more time on the line', rating: 3 }).expect(200);
    const arunJob = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.arun } }));
    expect((await inA((tx) => tx.probation.findFirstOrThrow({ where: { employmentId: arunJob.id } }))).extendedMonths).toBe(2);
    await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'terminate', comments: 'Safety rules not followed' }).expect(200);
    const k = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { employeeId: emp.arun } }));
    expect(k).toMatchObject({ exitType: 'probation_termination', status: 'submitted' });
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { status: 'open', assigneeUserId: { in: [users.hr, users.hr2] } } }));
    await api(task.assigneeUserId === users.hr ? 'hr' : 'hr2', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { id: k.id } }))).status).toBe('accepted');
    expect(await inA((tx) => tx.probationReview.count({ where: { exitCaseId: k.id } }))).toBe(1);
  });

  it('two companies apart', async () => {
    await api('adminB', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(404);
    expect((await api('adminB', 'get', '/lifecycle/exits').expect(200)).body.rows).toHaveLength(0);
    expect((await api('adminB', 'get', '/lifecycle/assets').expect(200)).body.rows).toHaveLength(0);
    await api('adminB', 'post', `/lifecycle/assets/${ids.laptop}/issue`).send({ employeeId: emp.ravi, issuedOn: today, condition: 'Fine' }).expect(404);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.exitCase.count())).toBe(0);
    await automation.dispatch().catch(() => undefined);
  });
});
