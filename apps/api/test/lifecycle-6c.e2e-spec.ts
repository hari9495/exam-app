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
import { AssetAlertsService } from '../src/lifecycle/asset-alerts.service';
import { addMonthsIso, contractEndsOn, netBookValue } from '../src/lifecycle/asset-categories';
import { Prisma } from '@prisma/client';

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
  type Who = 'adminA' | 'adminB' | 'hr' | 'hr2' | 'mgr' | 'it' | 'ravi' | 'sita' | 'arun' | 'meena' | 'kiran' | 'fin' | 'agent' | 'deskAgent' | 'otherAgent';
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
      // IT assets part 1 (answer 2711): Finance sees money on assets; an IT desk agent with asset.view only does not.
      ['fin', 'A', 'panel', tpl('finance')],
      ['agent', 'A', 'panel', ['asset.view']],
      // IT assets part 2 (answer 2722): Helpdesk agents who also see assets, each on their own IT desk.
      ['deskAgent', 'A', 'panel', [...tpl('desk_agent'), 'asset.view']],
      ['otherAgent', 'A', 'panel', [...tpl('desk_agent'), 'asset.view']],
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
    // The Issue picker: current employees by name, only for whoever may issue (IT holds no employee grant).
    expect((await api('hr', 'get', '/lifecycle/assets/people').expect(200)).body.map((p: { id: string }) => p.id)).toContain(emp.ravi);
    await api('ravi', 'get', '/lifecycle/assets/people').expect(403);
    for (const a of [ids.laptop, ids.phone]) await api('hr', 'post', `/lifecycle/assets/${a}/issue`).send({ employeeId: emp.ravi, issuedOn: today, condition: 'New' }).expect(200);
    await api('hr', 'post', `/lifecycle/assets/${ids.laptop}/issue`).send({ employeeId: emp.sita, issuedOn: today, condition: 'New' }).expect(409);
    const person = await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.sita } }));
    await expect(inA((tx) => tx.assetAssignment.create({ data: { organizationId: org.A.id, assetId: ids.laptop, personId: person.personId, issuedOn: new Date(`${today}T00:00:00Z`), issueCondition: 'x' } }))).rejects.toThrow();
    const mine = (await api('ravi', 'get', '/lifecycle/me/assets').expect(200)).body.rows;
    expect(mine).toHaveLength(2);
    await api('ravi', 'post', `/lifecycle/me/assets/${mine[0].assignmentId}/acknowledge`).expect(200);
    await api('sita', 'post', `/lifecycle/me/assets/${mine[1].assignmentId}/acknowledge`).expect(404);
    const list = (await api('hr', 'get', '/lifecycle/assets').expect(200)).body.rows;
    expect(list.find((r: { id: string }) => r.id === ids.laptop).holder).toMatchObject({ name: expect.stringMatching(/Ravi/), condition: 'New' });
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

  it('clearance: owners see only their items; a return clears its item; a lost asset becomes a recovery; all done â†’ cleared', async () => {
    const mgrItems = (await api('mgr', 'get', '/lifecycle/clearance/mine').expect(200)).body.rows;
    expect(mgrItems.map((i: { department: string }) => i.department)).toEqual(['manager_handover']);
    await api('ravi', 'get', '/lifecycle/clearance/mine').expect(200).expect((r) => expect(r.body.rows).toHaveLength(0));
    // PPL-20 HR view by leaver: every department of Ravi's exit for HR; the owner-only, the leaver and company B are refused.
    const byLeaver = (await api('hr', 'get', '/lifecycle/clearance').expect(200)).body.rows as { exitCaseId: string; department: string; person: string; owner: string }[];
    const ravis = byLeaver.filter((r) => r.exitCaseId === ids.raviCase);
    expect(new Set(ravis.map((r) => r.department))).toEqual(new Set(['manager_handover', 'it', 'admin', 'finance', 'hr', 'asset']));
    expect(ravis[0].person).toMatch(/Ravi/);
    await api('mgr', 'get', '/lifecycle/clearance').expect(403);
    await api('ravi', 'get', '/lifecycle/clearance').expect(403);
    expect((await api('adminB', 'get', '/lifecycle/clearance').expect(200)).body.rows.some((r: { exitCaseId: string }) => r.exitCaseId === ids.raviCase)).toBe(false);
    const handover = mgrItems[0];
    // PPL-20 blocked (needs migration 20261312000000_clearance_blocked): the owner marks it blocked with the reason; it
    // stays open; the leaver, another company, a short reason and a stale version are refused; signing off ends it.
    await api('ravi', 'post', `/lifecycle/clearance/${handover.id}/block`).send({ reason: 'Files not handed over', version: handover.version }).expect(404);
    await api('adminB', 'post', `/lifecycle/clearance/${handover.id}/block`).send({ reason: 'Files not handed over', version: handover.version }).expect((r) => expect([403, 404]).toContain(r.status));
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/block`).send({ reason: 'x', version: handover.version }).expect(400);
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/block`).send({ reason: 'Files not handed over', version: handover.version - 1 }).expect(409);
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/block`).send({ reason: 'Files not handed over', version: handover.version }).expect(200);
    const blocked = (await api('hr', 'get', '/lifecycle/clearance').expect(200)).body.rows.find((r: { id: string }) => r.id === handover.id);
    expect(blocked).toMatchObject({ status: 'open', blockedReason: 'Files not handed over' });
    handover.version = blocked.version;
    await api('ravi', 'post', `/lifecycle/clearance/${handover.id}/sign-off`).send({ action: 'clear', version: handover.version }).expect(404);
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/sign-off`).send({ action: 'waive', version: handover.version }).expect(400);
    await api('mgr', 'post', `/lifecycle/clearance/${handover.id}/sign-off`).send({ action: 'clear', note: 'All files moved', version: handover.version }).expect(200);
    expect((await api('hr', 'get', '/lifecycle/clearance').expect(200)).body.rows.find((r: { id: string }) => r.id === handover.id)).toMatchObject({ status: 'cleared', blockedReason: null });
    expect(await inA((tx) => tx.clearanceItem.findFirstOrThrow({ where: { id: handover.id } }))).toMatchObject({ status: 'cleared', blockedReason: null, blockedAt: null });
    // Signing off the laptop's clearance item (nothing owed) records the return too (founder 23 Oct 2026).
    const k0 = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    const lt = k0.clearance.find((i: { title: string }) => i.title.includes('ThinkPad'));
    await api('hr', 'post', `/lifecycle/clearance/${lt.id}/sign-off`).send({ action: 'clear', note: 'Handed back, good', version: lt.version }).expect(200);
    expect(await inA((tx) => tx.asset.findFirstOrThrow({ where: { id: ids.laptop } }))).toMatchObject({ status: 'in_stock' });
    expect(await inA((tx) => tx.assetAssignment.findFirst({ where: { assetId: ids.laptop, returnedOn: null } }))).toBeNull();
    // Not returned, charged in the same form (founder 24 Oct 2026): the recovery goes on the F&F and signs the item off.
    await api('hr', 'post', `/lifecycle/assets/${ids.phone}/return`).send({ returnedOn: today, condition: 'Not handed back', status: 'lost', recoveryAmount: '15000.00' }).expect(200);
    let k = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    const laptopItem = k.clearance.find((i: { title: string }) => i.title.includes('ThinkPad'));
    const phoneItem = k.clearance.find((i: { title: string }) => i.title.includes('Galaxy'));
    expect(laptopItem.status).toBe('cleared');
    expect(phoneItem).toMatchObject({ status: 'cleared', recoveryAmount: '15000.00' });
    // PPL-22: payroll's line names the asset and the condition it came back in, once each.
    const handoff = await inA(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      return tx.exitSettlementInput.findFirstOrThrow({ where: { exitCaseId: ids.raviCase, supersededAt: null } });
    });
    expect(handoff.recoveries).toEqual(expect.arrayContaining([expect.objectContaining({ source: 'asset', title: `Galaxy A35 (PH-${run})`, reason: 'Not returned: Not handed back', amount: '15000.00', status: 'recorded' })]));
    for (const i of k.clearance.filter((x: { status: string; department: string }) => x.status === 'open' && x.department !== 'asset' && x.department !== 'manager_handover')) {
      await api('hr', 'post', `/lifecycle/clearance/${i.id}/sign-off`).send({ action: 'clear', version: i.version }).expect(200);
    }
    k = (await api('hr', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(200)).body;
    expect(k.status).toBe('cleared');
    expect(k.clearance.find((i: { id: string }) => i.id === phoneItem.id)).toMatchObject({ recoveryAmount: '15000.00' });
  });

  it('exit interview: the answers stay HR-only; the manager learns only that it is done (API and raw query)', async () => {
    // The leaver was told it is ready when the exit was accepted (founder 24 Oct 2026).
    await automation.dispatch().catch(() => undefined);
    expect(await inA((tx) => tx.userNotification.count({ where: { recipientUserId: users.ravi, type: 'exit.interview.sent' } }))).toBeGreaterThan(0);
    const form = (await api('ravi', 'get', '/lifecycle/me/exit-interview').expect(200)).body;
    expect(form.status).toBe('sent');
    await api('ravi', 'put', '/lifecycle/me/exit-interview').send({ answers: { main_reason: 'manager' } }).expect(400);
    await api('ravi', 'put', '/lifecycle/me/exit-interview').send({ answers: { main_reason: 'manager', would_return: 'no', rating: 2, change: 'Fewer late calls' } }).expect(200);
    await api('ravi', 'put', '/lifecycle/me/exit-interview').send({ answers: { main_reason: 'manager', would_return: 'no', rating: 2 } }).expect(409);
    // HR who owns the exit is told the answers are in; the manager is not (founder 24 Oct 2026).
    const told = await inA((tx) => tx.userNotification.findMany({ where: { contextText: { contains: 'answered the exit interview' } }, select: { recipientUserId: true } }));
    expect(told.length).toBeGreaterThan(0);
    expect(told.some((t) => t.recipientUserId === users.mgr)).toBe(false);
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
    expect(list.find((r: { employeeId: string }) => r.employeeId === emp.arun)).toMatchObject({ canReview: true, designation: expect.any(String), manager: `Divya ${run}` });
    expect((await api('ravi', 'get', '/people/probations').expect(200)).body.rows).toEqual([]); // a colleague without the team or the key sees no one
    expect((await api('adminB', 'get', '/people/probations').expect(200)).body.rows).toEqual([]);
    await api('ravi', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 2, comments: 'Needs more time' }).expect(404);
    await api('arun', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'confirm', comments: 'I am great' }).expect(403);
    expect((await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 12, comments: 'Too long' }).expect(400)).body.message).toMatch(/at most 12 months/);
    await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 2, comments: 'Needs more time on the line', rating: 3 }).expect(200);
    // PPL-16: HR decides with the same review (its job-change grant reaches Arun); payroll's keys do not.
    await api('hr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'extend', months: 1, comments: 'One more month on the line', rating: 3 }).expect(200);
    const arunJob = await inA((tx) => tx.employment.findFirstOrThrow({ where: { employeeId: emp.arun } }));
    expect((await inA((tx) => tx.probation.findFirstOrThrow({ where: { employmentId: arunJob.id } }))).extendedMonths).toBe(3);
    // A missed review went to HR (escalated on the end date): the manager no longer reviews, HR does (founder 23 Oct 2026).
    await inA((tx) => tx.probation.updateMany({ where: { employmentId: arunJob.id }, data: { escalatedOn: new Date() } }));
    expect((await api('mgr', 'get', '/people/probations').expect(200)).body.rows.find((r: { employeeId: string }) => r.employeeId === emp.arun).canReview).toBe(false);
    expect((await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'confirm', comments: 'Late review' }).expect(403)).body.message).toMatch(/went to HR/);
    await inA((tx) => tx.probation.updateMany({ where: { employmentId: arunJob.id }, data: { escalatedOn: null } }));
    await api('mgr', 'post', `/lifecycle/probations/${emp.arun}/review`).send({ outcome: 'terminate', comments: 'Safety rules not followed' }).expect(200);
    const k = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { employeeId: emp.arun } }));
    expect(k).toMatchObject({ exitType: 'probation_termination', status: 'submitted' });
    const task = await inA((tx) => tx.wfTask.findFirstOrThrow({ where: { status: 'open', assigneeUserId: { in: [users.hr, users.hr2] } } }));
    await api(task.assigneeUserId === users.hr ? 'hr' : 'hr2', 'post', `/workflow/approvals/tasks/${task.id}/decide`).send({ decision: 'approve' }).expect(200);
    expect((await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { id: k.id } }))).status).toBe('accepted');
    expect(await inA((tx) => tx.probationReview.count({ where: { exitCaseId: k.id } }))).toBe(1);
  });

  it('PPL-03: a manager reads their team memberâ€™s assets and leave balances; a peer, another company: not found', async () => {
    const tag = `TB-${run}`;
    const id = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Phone', name: 'Tab A9', tag, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
    await api('hr', 'post', `/lifecycle/assets/${id}/issue`).send({ employeeId: emp.sita, issuedOn: today, condition: 'New' }).expect(200);
    const assets = (await api('mgr', 'get', `/lifecycle/people/${emp.sita}/assets`).expect(200)).body.rows;
    expect(assets).toEqual([expect.objectContaining({ tag, name: 'Tab A9', condition: 'New', acknowledged: false })]);
    await api('meena', 'get', `/lifecycle/people/${emp.sita}/assets`).expect(404); // a peer
    await api('sita', 'get', `/lifecycle/people/${emp.mgr}/assets`).expect(404); // not one's manager
    expect((await api('sita', 'get', `/lifecycle/people/${emp.sita}/assets`).expect(200)).body.rows).toHaveLength(1); // self
    expect((await api('hr', 'get', '/lifecycle/assets').expect(200)).body.rows.find((r: { tag: string }) => r.tag === tag).holder.name).toMatch(/Sita/); // HR unchanged
    await api('adminB', 'get', `/lifecycle/people/${emp.sita}/assets`).expect(404);
    const time = (path: string, who: Who) => request(server()).get(`/api/v1/time${path}`).set('Authorization', `Bearer ${token[who]}`);
    await time(`/people/${emp.sita}/balances`, 'mgr').expect(200);
    await time(`/people/${emp.sita}/balances`, 'sita').expect(200);
    await time(`/people/${emp.sita}/balances`, 'meena').expect(404);
    await time(`/people/${emp.sita}/balances`, 'adminB').expect(404);
  });

  it("asset returns go to the IT and Admin team on the exit checklist, not the issuer (the issuer only when there is no team)", async () => {
    const o = { organizationId: org.A.id };
    await inA(async (tx) => {
      const g = await tx.userGroup.create({ data: { ...o, name: `IT and Admin team ${run}` } });
      await tx.userGroupMember.create({ data: { ...o, groupId: g.id, userId: users.it } });
      await tx.journeyTemplateTask.updateMany({ where: { ...o, ownerType: { in: ['it', 'admin'] } }, data: { ownerGroupId: g.id } });
    });
    const neha = (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Neha', familyName: run, employeeCode: 'EX-007', joinedOn: '2026-04-06', workEmail: `neha@life6c-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: emp.mgr } }).expect(201)).body.id as string;
    const tag = `MS-${run}`;
    const id = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Surface Pro', tag, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
    await api('hr', 'post', `/lifecycle/assets/${id}/issue`).send({ employeeId: neha, issuedOn: today, condition: 'New' }).expect(200);
    await api('hr', 'post', '/lifecycle/exits').send({ employeeId: neha, exitType: 'end_of_contract', lwd: addDays(today, 20), reasonText: 'Contract ends' }).expect(201);
    const item = (who: Who) => api(who, 'get', '/lifecycle/clearance/mine').expect(200).then((r) => (r.body.rows as { title: string }[]).find((i) => i.title.includes(tag)));
    expect(await item('it')).toBeTruthy();
    expect(await item('hr')).toBeUndefined(); // HR issued it, but IT takes it back
  });

  it('HR withdraws an exit HR started (founder 28 Oct 2026): the checklist and clearance stop, the asset stays; refusals', async () => {
    const hireOne = async (given: string, code: string) =>
      (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', workEmail: `${code.toLowerCase()}@life6c-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: emp.mgr } }).expect(201)).body.id as string;
    const exit = async (employeeId: string, exitType: string, lwd = addDays(today, 30)) => (await api('hr', 'post', '/lifecycle/exits').send({ employeeId, exitType, lwd, reasonText: 'Recorded by mistake' }).expect(201)).body;
    const withdraw = (who: Who, id: string, body: object) => api(who, 'post', `/lifecycle/exits/${id}/withdraw`).send(body);

    // Positive: an end of contract with an asset out.
    const leela = await hireOne('Leela', 'EX-008');
    const tag = `WD-${run}`;
    const asset = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Latitude 5450', tag, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
    await api('hr', 'post', `/lifecycle/assets/${asset}/issue`).send({ employeeId: leela, issuedOn: today, condition: 'New' }).expect(200);
    const k = await exit(leela, 'end_of_contract');
    expect(k.status).toBe('accepted');
    await withdraw('hr', k.id, {}).expect(400); // the reason is required
    await withdraw('hr', k.id, { reason: 'x' }).expect(400);
    await withdraw('mgr', k.id, { reason: 'Not mine to undo' }).expect(403); // no lifecycle.exit.manage
    await withdraw('adminB', k.id, { reason: 'Another company' }).expect(404);
    const done = (await withdraw('hr', k.id, { reason: 'Contract was renewed last week' }).expect(200)).body;
    expect(done).toMatchObject({ status: 'withdrawn', withdrawalReason: 'Contract was renewed last week' });
    expect(done.clearance.length).toBeGreaterThan(0);
    expect(done.clearance.every((i: { status: string }) => i.status === 'waived')).toBe(true);
    const row = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { id: k.id } }));
    expect(row).toMatchObject({ withdrawnBy: users.hr, withdrawalReason: 'Contract was renewed last week' });
    const journey = await inA((tx) => tx.journey.findFirstOrThrow({ where: { subjectType: 'exit_case', subjectId: k.id } }));
    expect(journey.status).toBe('cancelled');
    expect(await inA((tx) => tx.journeyTask.count({ where: { journeyId: journey.id, status: { in: ['open', 'waiting'] } } }))).toBe(0);
    expect((await inA((tx) => tx.assetAssignment.findFirstOrThrow({ where: { assetId: asset } }))).returnedOn).toBeNull(); // still with her
    const ev = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findFirstOrThrow({ where: { organizationId: org.A.id, action: 'exit.case.withdrawn', entityId: k.id } }));
    expect(ev.actorUserId).toBe(users.hr);
    expect(JSON.parse(ev.metadataJson!)).toMatchObject({ before: 'accepted', by: users.hr, reason: 'Contract was renewed last week' });
    expect(await tenantPrisma.forTenant(SUPER, (tx) => tx.userNotification.count({ where: { organizationId: org.A.id, recipientUserId: users.mgr, type: 'exit.case.update', entityId: k.id } }))).toBe(1);
    expect((await withdraw('hr', k.id, { reason: 'Once more' }).expect(400)).body.message).toMatch(/already withdrawn/);

    // A termination still waiting for the second HR approval: its approval request ends too.
    const t = await exit(await hireOne('Tara', 'EX-009'), 'termination');
    expect(t.status).toBe('submitted');
    await withdraw('hr', t.id, { reason: 'Wrong person picked' }).expect(200);
    const tRow = await inA((tx) => tx.exitCase.findFirstOrThrow({ where: { id: t.id } }));
    expect(tRow.status).toBe('withdrawn');
    expect((await inA((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: tRow.wfRequestId! } }))).status).toBe('withdrawn');
    expect(await inA((tx) => tx.wfTask.count({ where: { requestId: tRow.wfRequestId!, status: 'open' } }))).toBe(0);

    // Allowed on the last working day itself (as an employee's resignation); refused once it has passed.
    const late = await exit(await hireOne('Usha', 'EX-010'), 'retirement');
    await inA((tx) => tx.exitCase.update({ where: { id: late.id }, data: { approvedLwd: new Date(`${addDays(today, -1)}T00:00:00Z`) } }));
    expect((await withdraw('hr', late.id, { reason: 'Too late now' }).expect(400)).body.message).toMatch(/last working day has passed/);
    await inA((tx) => tx.exitCase.update({ where: { id: late.id }, data: { approvedLwd: new Date(`${today}T00:00:00Z`) } }));
    await withdraw('hr', late.id, { reason: 'Still the last day' }).expect(200);

    // Refused: the F&F finalised; an employee's resignation.
    const paid = await exit(await hireOne('Vani', 'EX-011'), 'end_of_contract');
    await inA(async (tx) => {
      const e = await tx.employment.findFirstOrThrow({ where: { employeeId: paid.employeeId } });
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
      await tx.fnfSettlement.create({ data: { organizationId: org.A.id, legalEntityId: ids.entity, employeeId: paid.employeeId, employmentId: e.id, exitCaseId: paid.id, exitType: 'end_of_contract', inputRevision: 1, lwd: new Date(`${addDays(today, 30)}T00:00:00Z`), deadline: new Date(`${addDays(today, 32)}T00:00:00Z`), status: 'settled' } });
    });
    expect((await withdraw('hr', paid.id, { reason: 'Too late now' }).expect(400)).body.message).toMatch(/full and final/);
    expect((await withdraw('hr', ids.raviCase, { reason: 'Not HR to undo' }).expect(400)).body.message).toMatch(/employee/);
  });

  it('the asset page (IT assets plan, 26 Nov 2026): details with maker, model, invoice and warranty end; the history; who may see it', async () => {
    const tag = `MB-${run}`;
    const base = { category: 'Laptop', name: 'MacBook Air', tag, legalEntityId: ids.entity, locationId: ids.blr, purchasedOn: '2026-01-31', cost: '99000.00', maker: 'Apple', model: 'M3 13-inch', invoiceNumber: 'INV-77' };
    await api('hr', 'post', '/lifecycle/assets').send({ ...base, warrantyMonths: 121 }).expect(400);
    await api('hr', 'post', '/lifecycle/assets').send({ ...base, warrantyMonths: -1 }).expect(400);
    const id = (await api('hr', 'post', '/lifecycle/assets').send({ ...base, warrantyMonths: 13 }).expect(201)).body.id as string;
    await api('hr', 'post', `/lifecycle/assets/${id}/issue`).send({ employeeId: emp.sita, issuedOn: today, condition: 'New' }).expect(200);
    const mine = (await api('sita', 'get', '/lifecycle/me/assets').expect(200)).body.rows.find((r: { tag: string }) => r.tag === tag);
    await api('sita', 'post', `/lifecycle/me/assets/${mine.assignmentId}/acknowledge`).expect(200);
    await api('hr', 'post', `/lifecycle/assets/${id}/return`).send({ returnedOn: today, condition: 'Good', status: 'in_stock' }).expect(200);
    const before = (await api('hr', 'get', `/lifecycle/assets/${id}`).expect(200)).body;
    await api('hr', 'put', `/lifecycle/assets/${id}`).send({ ...base, model: 'M3 15-inch', warrantyMonths: 13, version: before.asset.version }).expect(200);
    // IT (asset.view and asset.manage, no employee grant) reads the page.
    const page = (await api('it', 'get', `/lifecycle/assets/${id}`).expect(200)).body;
    expect(page.asset).toMatchObject({ tag, maker: 'Apple', model: 'M3 15-inch', invoiceNumber: 'INV-77', warrantyMonths: 13, warrantyEndsOn: '2027-02-28', purchasedOn: '2026-01-31', status: 'in_stock' });
    expect(page.asset.location).toBeTruthy();
    expect(page.holder).toBeNull();
    const whats = page.history.map((h: { what: string }) => h.what);
    expect(whats).toHaveLength(5);
    expect(whats).toEqual(expect.arrayContaining(['added the asset', 'changed the details', expect.stringMatching(/^issued it to Sita.* \(New\)$/), 'confirmed they received it', expect.stringMatching(/^took it back from Sita.* \(Good\)$/)]));
    expect(page.history.find((h: { what: string }) => h.what === 'confirmed they received it').who).toMatch(/Sita/);
    // Refusals: no asset key 403; an unknown asset or another company's 404.
    await api('ravi', 'get', `/lifecycle/assets/${id}`).expect(403);
    await api('hr', 'get', `/lifecycle/assets/${randomUUID()}`).expect(404);
    await api('adminB', 'get', `/lifecycle/assets/${id}`).expect(404);
  });

  it('IT assets part 1 (2712): the starter list, HR adds, changes and retires categories; an asset takes one from the list', async () => {
    const cats = (await api('hr', 'get', '/lifecycle/asset-categories').expect(200)).body;
    expect(cats.canEdit).toBe(true);
    expect(cats.rows.map((x: { name: string }) => x.name)).toEqual(expect.arrayContaining(['Laptop', 'Phone', 'SIM', 'ID / access card', 'Safety shoes and PPE kit', 'Tools']));
    expect(cats.rows.find((x: { name: string }) => x.name === 'Laptop')).toMatchObject({ trackedBy: 'Serial number', defaultRecovery: '45000.00', usefulLifeYears: 3 });
    // Readers who may not change them, and no key at all.
    expect((await api('it', 'get', '/lifecycle/asset-categories').expect(200)).body.canEdit).toBe(false);
    await api('ravi', 'get', '/lifecycle/asset-categories').expect(403);
    await api('it', 'post', '/lifecycle/asset-categories').send({ name: 'Drone' }).expect(403);
    // Add; the same name again (any case), a bad name or a useful life over 50 years: refused.
    const tab = (await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Tablet ${run}`, trackedBy: 'Serial number', defaultRecovery: '20000.00', usefulLifeYears: 3 }).expect(201)).body.id as string;
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `TABLET ${run}` }).expect(409);
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: 'Drone <b>' }).expect(400);
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: 'Drone', usefulLifeYears: 99 }).expect(400);
    // Change with its version; a stale version or another company: refused.
    await api('hr', 'put', `/lifecycle/asset-categories/${tab}`).send({ name: `Tablet ${run}`, trackedBy: 'IMEI', defaultRecovery: '22000.00', usefulLifeYears: 4, version: 1 }).expect(200);
    await api('hr', 'put', `/lifecycle/asset-categories/${tab}`).send({ name: `Tablet ${run}`, version: 1 }).expect(409);
    await api('adminB', 'put', `/lifecycle/asset-categories/${tab}`).send({ name: 'Other', version: 2 }).expect(404);
    // An asset takes a category from the list (by id, or by name for older callers); a name not on it is refused.
    const tag = `GT-${run}`;
    const id = (await api('hr', 'post', '/lifecycle/assets').send({ categoryId: tab, name: 'Galaxy Tab S9', tag, legalEntityId: ids.entity, locationId: ids.blr, cost: '30000.00' }).expect(201)).body.id as string;
    await api('hr', 'post', '/lifecycle/assets').send({ category: 'Hoverboard', name: 'x', tag: `HB-${run}`, legalEntityId: ids.entity }).expect(400);
    await api('hr', 'post', '/lifecycle/assets').send({ categoryId: randomUUID(), name: 'x', tag: `HB-${run}`, legalEntityId: ids.entity }).expect(400);
    expect((await api('hr', 'get', '/lifecycle/asset-categories').expect(200)).body.rows.find((x: { id: string }) => x.id === tab)).toMatchObject({ trackedBy: 'IMEI', assets: 1, version: 2 });
    // Retired, never deleted: it leaves the list and new assets; the asset keeps it, and may be saved with it.
    await api('it', 'post', `/lifecycle/asset-categories/${tab}/retire`).expect(403);
    await api('hr', 'post', `/lifecycle/asset-categories/${tab}/retire`).expect(200);
    await api('hr', 'post', `/lifecycle/asset-categories/${tab}/retire`).expect(404);
    expect((await api('hr', 'get', '/lifecycle/asset-categories').expect(200)).body.rows.map((x: { id: string }) => x.id)).not.toContain(tab);
    await api('hr', 'post', '/lifecycle/assets').send({ categoryId: tab, name: 'Tab 2', tag: `TB2-${run}`, legalEntityId: ids.entity }).expect(400);
    const page = (await api('hr', 'get', `/lifecycle/assets/${id}`).expect(200)).body;
    expect(page.asset).toMatchObject({ categoryId: tab, category: `Tablet ${run}` });
    await api('hr', 'put', `/lifecycle/assets/${id}`).send({ categoryId: tab, name: 'Galaxy Tab S9 FE', tag, legalEntityId: ids.entity, locationId: ids.blr, cost: '30000.00', version: page.asset.version }).expect(200);
    // Every change is audited.
    const actions = (await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_category', entityId: tab } }))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['asset.category.added', 'asset.category.updated', 'asset.category.retired']));
  });

  it('IT assets part 1 (2720): a category tag pattern suggests the next tag; a typed tag still works; tags stay unique', async () => {
    const year = today.slice(0, 4);
    const prefix = `Q${run.replace(/[^a-z0-9]/gi, '').slice(0, 6)}`.toUpperCase();
    const cat = (await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Scanner ${run}`, tagPrefix: prefix.toLowerCase(), tagYear: true, tagDigits: 4 }).expect(201)).body.id as string;
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Bad ${run}`, tagPrefix: 'A-B' }).expect(400);
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Bad ${run}`, tagPrefix: 'AB', tagDigits: 9 }).expect(400);
    const next = async () => (await api('it', 'get', '/lifecycle/asset-categories').expect(200)).body.rows.find((x: { id: string }) => x.id === cat);
    expect(await next()).toMatchObject({ tagPrefix: prefix, tagYear: true, tagDigits: 4, nextTag: `${prefix}-${year}-0001` });
    await api('it', 'post', '/lifecycle/assets').send({ categoryId: cat, name: 'Scanner 1', tag: `${prefix}-${year}-0001`, legalEntityId: ids.entity }).expect(201);
    await api('it', 'post', '/lifecycle/assets').send({ categoryId: cat, name: 'Scanner typed', tag: `SC-OWN-${run}`, legalEntityId: ids.entity }).expect(201);
    expect((await next()).nextTag).toBe(`${prefix}-${year}-0002`);
    // The same tag again (any case) is refused.
    await api('it', 'post', '/lifecycle/assets').send({ categoryId: cat, name: 'Scanner dup', tag: `${prefix.toLowerCase()}-${year}-0001`, legalEntityId: ids.entity }).expect(409);
  });

  it('IT assets part 1 (2711): cost only for asset managers of the place and asset.finance.view; never sent to anyone else', async () => {
    const tag = `MN-${run}`;
    const id = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'ThinkPad X1', tag, legalEntityId: ids.entity, locationId: ids.blr, cost: '120000.00' }).expect(201)).body.id as string;
    const row = async (who: Who) => {
      const body = (await api(who, 'get', '/lifecycle/assets').expect(200)).body;
      return { money: body.money, row: body.rows.find((x: { tag: string }) => x.tag === tag) };
    };
    expect(await row('hr')).toMatchObject({ money: true, row: { cost: '120000.00' } });
    expect(await row('fin')).toMatchObject({ money: true, row: { cost: '120000.00' } });
    const agent = await row('agent');
    expect(agent.money).toBe(false);
    expect(agent.row).toBeTruthy();
    expect(agent.row).not.toHaveProperty('cost');
    const page = (await api('agent', 'get', `/lifecycle/assets/${id}`).expect(200)).body;
    expect(page.money).toBe(false);
    expect(page.asset).not.toHaveProperty('cost');
    expect(JSON.stringify(page)).not.toContain('120000');
    expect((await api('fin', 'get', `/lifecycle/assets/${id}`).expect(200)).body.asset.cost).toBe('120000.00');
    // Neither may change the asset.
    await api('agent', 'put', `/lifecycle/assets/${id}`).send({ category: 'Laptop', name: 'x', tag }).expect(403);
    await api('fin', 'put', `/lifecycle/assets/${id}`).send({ category: 'Laptop', name: 'x', tag }).expect(403);
  });

  it('IT assets part 1 (2712 settings): acknowledgement "None" asks nothing; recovery to F&F off refuses a recovery', async () => {
    const o = { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id };
    const ack = await inA((tx) => tx.setting.create({ data: { ...o, key: 'asset.ack_method', value: 'none' } }));
    const off = await inA((tx) => tx.setting.create({ data: { ...o, key: 'asset.recovery_to_fnf', value: 'off' } }));
    try {
      const tag = `NA-${run}`;
      const id = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'SIM', name: 'Jio SIM', tag, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
      await api('hr', 'post', `/lifecycle/assets/${id}/issue`).send({ employeeId: emp.sita, issuedOn: today, condition: 'New' }).expect(200);
      expect((await api('sita', 'get', '/lifecycle/me/assets').expect(200)).body.rows.find((x: { tag: string }) => x.tag === tag)).toMatchObject({ ackNone: true });
      const list = (await api('hr', 'get', '/lifecycle/assets').expect(200)).body;
      expect(list.recovery).toEqual({ toFnf: false, basis: 'category_default' });
      expect(list.rows.find((x: { tag: string }) => x.tag === tag).holder).toMatchObject({ acknowledged: true, ackNone: true });
      await api('hr', 'post', `/lifecycle/assets/${id}/return`).send({ returnedOn: today, condition: 'Damaged', status: 'in_repair', recoveryAmount: '500.00' }).expect(400);
      await api('hr', 'post', `/lifecycle/assets/${id}/return`).send({ returnedOn: today, condition: 'Good', status: 'in_stock' }).expect(200);
    } finally {
      await inA((tx) => tx.setting.update({ where: { id: ack.id }, data: { value: 'click' } }));
      await inA((tx) => tx.setting.update({ where: { id: off.id }, data: { value: 'on' } }));
    }
  });

  it('IT assets part 2 (2713): depreciation per category; the net book value today on the asset page, money only', async () => {
    // Declining balance needs its yearly rate, above 0 and below 100.
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Server ${run}`, depreciationMethod: 'declining' }).expect(400);
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Server ${run}`, depreciationMethod: 'declining', depreciationRate: '0' }).expect(400);
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Server ${run}`, depreciationMethod: 'declining', depreciationRate: '100' }).expect(400);
    await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Server ${run}`, depreciationMethod: 'yearly', depreciationRate: '40' }).expect(400);
    const srv = (await api('hr', 'post', '/lifecycle/asset-categories').send({ name: `Server ${run}`, depreciationMethod: 'declining', depreciationRate: '40' }).expect(201)).body.id as string;
    const cats = (await api('hr', 'get', '/lifecycle/asset-categories').expect(200)).body.rows;
    expect(cats.find((x: { id: string }) => x.id === srv)).toMatchObject({ depreciationMethod: 'declining', depreciationRate: '40.00' });
    expect(cats.find((x: { name: string }) => x.name === 'Laptop')).toMatchObject({ depreciationMethod: 'straight_line', depreciationRate: null, usefulLifeYears: 3 });
    const add = async (body: Record<string, unknown>) => (await api('hr', 'post', '/lifecycle/assets').send({ legalEntityId: ids.entity, locationId: ids.blr, ...body }).expect(201)).body.id as string;
    const page = async (who: Who, id: string) => (await api(who, 'get', `/lifecycle/assets/${id}`).expect(200)).body;
    const year = Number(today.slice(0, 4));
    // Straight line over the Laptop's 3 years: a year in, two thirds left (by day); 4 years in, fully depreciated (0).
    const oneYear = `${year - 1}${today.slice(4)}`.replace(/-02-29$/, '-02-28');
    const a1 = await add({ category: 'Laptop', name: 'Laptop 1y', tag: `D1-${run}`, purchasedOn: oneYear, cost: '90000.00' });
    const p1 = (await page('hr', a1)).asset;
    expect(p1.depreciation).toBe('Straight line over 3 years');
    expect(Number(p1.netBookValue)).toBeGreaterThan(59900);
    expect(Number(p1.netBookValue)).toBeLessThan(60100);
    const a4 = await add({ category: 'Laptop', name: 'Laptop 4y', tag: `D4-${run}`, purchasedOn: `${year - 4}-01-01`, cost: '90000.00' });
    expect((await page('fin', a4)).asset.netBookValue).toBe('0.00');
    // Declining at 40 %: a year in, 60 % left.
    const s1 = await add({ categoryId: srv, name: 'Server 1y', tag: `DS-${run}`, purchasedOn: oneYear, cost: '100000.00' });
    const ps = (await page('hr', s1)).asset;
    expect(ps.depreciation).toBe('Declining balance at 40% a year');
    expect(Number(ps.netBookValue)).toBeGreaterThan(59900);
    expect(Number(ps.netBookValue)).toBeLessThan(60100);
    // Negative: no purchase date or no cost: no value; a category without a useful life (SIM): no depreciation.
    expect((await page('hr', await add({ category: 'Laptop', name: 'No date', tag: `DN-${run}`, cost: '50000.00' }))).asset.netBookValue).toBeNull();
    expect((await page('hr', await add({ category: 'Laptop', name: 'No cost', tag: `DC-${run}`, purchasedOn: oneYear }))).asset.netBookValue).toBeNull();
    const sim = (await page('hr', await add({ category: 'SIM', name: 'SIM', tag: `DM-${run}`, purchasedOn: oneYear, cost: '500.00' }))).asset;
    expect(sim).toMatchObject({ netBookValue: null, depreciation: null });
    // Money (answer 2711): an asset.view-only agent gets neither the value nor how it is worked out.
    const ag = await page('agent', a1);
    expect(ag.asset).not.toHaveProperty('netBookValue');
    expect(ag.asset).not.toHaveProperty('depreciation');
    // Changing the method is audited with before and after.
    const v = cats.find((x: { id: string }) => x.id === srv).version;
    await api('hr', 'put', `/lifecycle/asset-categories/${srv}`).send({ name: `Server ${run}`, depreciationMethod: 'straight_line', usefulLifeYears: 6, version: v }).expect(200);
    const upd = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { entityType: 'asset_category', entityId: srv, action: 'asset.category.updated' } }));
    expect(JSON.parse(upd.metadataJson ?? '{}')).toMatchObject({ from: { depreciationMethod: 'declining', depreciationRate: '40.00' }, to: { depreciationMethod: 'straight_line', depreciationRate: null } });
    expect((await page('hr', s1)).asset.depreciation).toBe('Straight line over 6 years');
  });

  it('IT assets follow-up (2820): a written-down recovery is the net book value on the last working day, kept when the settlement changes', async () => {
    const o = { organizationId: org.A.id, scopeType: 'tenant', scopeId: org.A.id };
    const basis = await inA((tx) => tx.setting.create({ data: { ...o, key: 'asset.recovery_basis', value: 'written_down' } }));
    try {
      const nisha = (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Nisha', familyName: run, employeeCode: 'EX-W01', joinedOn: '2026-04-06', workEmail: `ex-w01@life6c-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: emp.mgr } }).expect(201)).body.id as string;
      const bought = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`.replace(/-02-29$/, '-02-28');
      const tag = `WD-${run}`;
      const id = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Written-down laptop', tag, legalEntityId: ids.entity, locationId: ids.blr, purchasedOn: bought, cost: '90000.00' }).expect(201)).body.id as string;
      await api('hr', 'post', `/lifecycle/assets/${id}/issue`).send({ employeeId: nisha, issuedOn: today, condition: 'Good' }).expect(200);
      const lwd = addDays(today, 60);
      const k = (await api('hr', 'post', '/lifecycle/exits').send({ employeeId: nisha, exitType: 'end_of_contract', lwd, reasonText: 'Contract ends' }).expect(201)).body;
      expect(k.status).toBe('accepted');
      const rule = { depreciationMethod: 'straight_line', usefulLifeYears: 3, depreciationRate: null };
      const atLwd = netBookValue(new Prisma.Decimal('90000.00'), bought, lwd, rule)!;
      const atToday = netBookValue(new Prisma.Decimal('90000.00'), bought, today, rule)!;
      expect(atLwd).not.toBe(atToday); // 60 days of depreciation apart
      const current = () =>
        inA(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.entity}}`}, true)`;
          return tx.exitSettlementInput.findFirstOrThrow({ where: { exitCaseId: k.id, supersededAt: null } });
        });
      const line = (r: { recoveries: unknown }) => (r.recoveries as { title: string; amount: string | null; status: string }[]).find((x) => x.title.includes(tag));
      const first = await current();
      expect(line(first)).toMatchObject({ amount: atLwd, status: 'open' });
      // The return form starts from the same amount.
      expect((await api('hr', 'get', '/lifecycle/assets').expect(200)).body.rows.find((r: { id: string }) => r.id === id).holder).toMatchObject({ leavingOn: lwd, recoveryDefault: atLwd });
      // A later revision (letters put on hold) keeps it, not today's value.
      await api('hr', 'put', `/lifecycle/exits/${k.id}/hr`).send({ hold: true, holdReason: 'Laptop not back', version: k.version }).expect(200);
      const second = await current();
      expect(second.revision).toBeGreaterThan(first.revision);
      expect(line(second)).toMatchObject({ amount: atLwd, status: 'open' });
      expect(line(second)!.amount).not.toBe(atToday);
    } finally {
      await inA((tx) => tx.setting.update({ where: { id: basis.id }, data: { value: 'category_default' } }));
    }
  });

  it('IT assets part 2 (2714): asset managers of the place are told once before a warranty ends; the register shows the end', async () => {
    const alerts = app.get(AssetAlertsService);
    const o = { organizationId: org.A.id };
    // Meena manages assets at this location only (a grant); Kiran at another location only.
    const other = await inA((tx) => tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: `Chennai ${run}`, code: `C${run.slice(0, 4)}`, address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } }));
    await inA(async (tx) => {
      const role = await tx.permissionProfile.create({ data: { ...o, name: `asset-place-${run}`, permissionsJson: JSON.stringify(['asset.view', 'asset.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.meena, permissionProfileId: role.id, scopeType: 'location', locationId: ids.blr, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Site IT', grantedBy: users.adminA } });
      await tx.roleGrant.create({ data: { ...o, userId: users.kiran, permissionProfileId: role.id, scopeType: 'location', locationId: other.id, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Other site IT', grantedBy: users.adminA } });
    });
    const back = (days: number) => new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
    const add = async (tag: string, purchasedOn: string, warrantyMonths: number) => (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: `Warranty ${tag}`, tag: `${tag}-${run}`, legalEntityId: ids.entity, locationId: ids.blr, purchasedOn, warrantyMonths }).expect(201)).body.id as string;
    const soon = await add('WS', back(20), 1); // ends in about 10 days
    const later = await add('WL', back(15), 2); // ends in about 45 days: past the 30-day lead
    const ended = await add('WE', back(70), 1); // ended last month
    const told = (asset: string) => inA((tx) => tx.userNotification.findMany({ where: { type: 'asset.warranty.ending', entityId: asset }, select: { recipientUserId: true } })).then((r) => r.map((x) => x.recipientUserId));
    await alerts.warrantySweep();
    const first = await told(soon);
    expect(first).toEqual(expect.arrayContaining([users.hr, users.it, users.meena, users.adminA]));
    // Negative: no asset.manage over the place (Finance, the asset.view agent, another site's manager, an employee).
    for (const who of ['fin', 'agent', 'kiran', 'ravi'] as const) expect(first).not.toContain(users[who]);
    expect(await told(later)).toEqual([]);
    expect(await told(ended)).toEqual([]);
    // Audited once; a second run tells nobody again.
    expect(await inA((tx) => tx.auditLog.count({ where: { entityType: 'asset', entityId: soon, action: 'asset.warranty.alerted' } }))).toBe(1);
    await alerts.warrantySweep();
    expect((await told(soon)).length).toBe(first.length);
    // A longer lead (60 days, a company setting) reaches the later one; a changed warranty end is told again.
    const lead = await inA((tx) => tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'asset.warranty_alert_days', value: '60' } }));
    try {
      await alerts.warrantySweep();
      expect(await told(later)).toContain(users.hr);
      const v = (await api('hr', 'get', `/lifecycle/assets/${soon}`).expect(200)).body.asset.version;
      await api('hr', 'put', `/lifecycle/assets/${soon}`).send({ category: 'Laptop', name: 'Warranty WS', tag: `WS-${run}`, legalEntityId: ids.entity, locationId: ids.blr, purchasedOn: back(20), warrantyMonths: 2, version: v }).expect(200);
      await alerts.warrantySweep();
      expect((await told(soon)).length).toBe(first.length * 2);
      // Off: nobody is told.
      await inA((tx) => tx.setting.update({ where: { id: lead.id }, data: { value: 'off' } }));
      const quiet = await add('WO', back(25), 1);
      await alerts.warrantySweep();
      expect(await told(quiet)).toEqual([]);
    } finally {
      await inA((tx) => tx.setting.update({ where: { id: lead.id }, data: { value: '30' } }));
    }
    // The register sends the warranty end (red when it has passed, in the page).
    const rows = (await api('it', 'get', '/lifecycle/assets').expect(200)).body.rows;
    expect(rows.find((r: { id: string }) => r.id === ended).warrantyEndsOn).toBe(addMonthsIso(back(70), 1));
    // Another company's people are never told.
    expect(await told(soon)).not.toContain(users.adminB);
  });

  it('IT assets part 2 (2722): the Tickets tab lists only the tickets the viewer may see on the Helpdesk; others get the count', async () => {
    const it1 = (await api('adminA', 'post', '/desk/desks').send({ name: `IT ${run}`, key: `I${run.slice(0, 4).toUpperCase()}`, kind: 'it' }).expect(201)).body.id as string;
    const it2 = (await api('adminA', 'post', '/desk/desks').send({ name: `IT two ${run}`, key: `J${run.slice(0, 4).toUpperCase()}`, kind: 'it' }).expect(201)).body.id as string;
    await api('adminA', 'post', `/desk/desks/${it1}/members`).send({ userId: users.deskAgent, role: 'agent' }).expect(201);
    await api('adminA', 'post', `/desk/desks/${it2}/members`).send({ userId: users.otherAgent, role: 'agent' }).expect(201);
    const tag = `TK-${run}`;
    const id = (await api('hr', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Ticketed laptop', tag, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
    const tickets = async (who: Who) => (await api(who, 'get', `/lifecycle/assets/${id}`).expect(200)).body.tickets;
    // No tickets yet: a count of 0 for everyone.
    expect(await tickets('hr')).toEqual({ count: 0, rows: [] });
    await api('hr', 'post', `/lifecycle/assets/${id}/issue`).send({ employeeId: emp.sita, issuedOn: today, condition: 'Good' }).expect(200);
    const raise = (deskId: string, subject: string) => api('sita', 'post', '/desk/my/tickets').send({ deskId, subject, description: 'The screen flickers.', assetId: id }).expect(201).then((r) => r.body.id as string);
    const t1 = await raise(it1, `Flicker ${run}`);
    const t2 = await raise(it2, `Battery ${run}`);
    // An agent of each desk sees that desk's ticket only, with the count of all.
    const mine = await tickets('deskAgent');
    expect(mine.count).toBe(2);
    expect(mine.rows).toEqual([expect.objectContaining({ id: t1, subject: `Flicker ${run}`, number: expect.any(String), state: expect.any(String), raisedAt: expect.any(String) })]);
    expect((await tickets('otherAgent')).rows.map((r: { id: string }) => r.id)).toEqual([t2]);
    // Negative: asset managers and asset.view holders without a desk seat get the count only, never a subject.
    for (const who of ['hr', 'it', 'agent', 'fin'] as const) {
      const body = (await api(who, 'get', `/lifecycle/assets/${id}`).expect(200)).body;
      expect(body.tickets).toEqual({ count: 2, rows: [] });
      expect(JSON.stringify(body)).not.toContain(`Flicker ${run}`);
    }
    // Another company: no asset at all.
    await api('adminB', 'get', `/lifecycle/assets/${id}`).expect(404);
  });

  it('IT assets part 3 (2716): the IT and Admin supplier list; asset managers add, change and retire; an asset names its supplier', async () => {
    const sup = { name: `Dell India ${run}`, gstin: '29aabcd1234e1z5', contacts: [{ name: 'Suresh Kumar', email: 'suresh@dell.test', phone: '+91 98450 12345' }], notes: 'Laptops and their service' };
    const id = (await api('it', 'post', '/lifecycle/asset-suppliers').send(sup).expect(201)).body.id as string;
    ids.supplier = id;
    // Negative: only asset.manage holders change the list; nobody without an asset key reads it; bad values are refused.
    await api('agent', 'post', '/lifecycle/asset-suppliers').send({ ...sup, name: `Other ${run}` }).expect(403);
    await api('fin', 'post', '/lifecycle/asset-suppliers').send({ ...sup, name: `Other ${run}` }).expect(403);
    await api('ravi', 'get', '/lifecycle/asset-suppliers').expect(403);
    await api('it', 'post', '/lifecycle/asset-suppliers').send({ ...sup, name: `Bad GSTIN ${run}`, gstin: '29AABCD1234' }).expect(400);
    await api('it', 'post', '/lifecycle/asset-suppliers').send({ ...sup, name: `Bad email ${run}`, contacts: [{ name: 'Asha', email: 'not-an-email' }] }).expect(400);
    await api('it', 'post', '/lifecycle/asset-suppliers').send({ ...sup, name: `Six ${run}`, contacts: Array.from({ length: 6 }, (_, i) => ({ name: `Person ${i}` })) }).expect(400);
    await api('hr', 'post', '/lifecycle/asset-suppliers').send({ ...sup, name: sup.name.toUpperCase() }).expect(409);
    // Read by asset.view (to pick it): the GSTIN in capitals, the contacts as given.
    const list = (await api('agent', 'get', '/lifecycle/asset-suppliers').expect(200)).body;
    expect(list.canManage).toBe(false);
    expect(list.rows.find((r: { id: string }) => r.id === id)).toMatchObject({ name: sup.name, gstin: '29AABCD1234E1Z5', contacts: [{ name: 'Suresh Kumar', email: 'suresh@dell.test', phone: '+91 98450 12345' }], retired: false, assets: 0 });
    expect((await api('it', 'get', '/lifecycle/asset-suppliers').expect(200)).body.canManage).toBe(true);
    // An asset names its supplier (Add asset, the asset page).
    const tag = `SUP-${run}`;
    const asset = (await api('it', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Supplied laptop', tag, legalEntityId: ids.entity, locationId: ids.blr, supplierId: id }).expect(201)).body.id as string;
    ids.suppliedAsset = asset;
    expect((await api('agent', 'get', `/lifecycle/assets/${asset}`).expect(200)).body.asset).toMatchObject({ supplierId: id, supplier: sup.name });
    expect((await api('it', 'get', '/lifecycle/asset-suppliers').expect(200)).body.rows.find((r: { id: string }) => r.id === id).assets).toBe(1);
    // Changed and retired (with its version); a stale version is refused.
    await api('it', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, notes: 'Laptops only', retired: true, version: 1 }).expect(200);
    await api('it', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, version: 1 }).expect(409);
    expect((await api('it', 'get', '/lifecycle/asset-suppliers').expect(200)).body.rows.find((r: { id: string }) => r.id === id)).toMatchObject({ retired: true, notes: 'Laptops only' });
    // A retired supplier is not offered for another asset; the asset that has it keeps it when its details change.
    await api('it', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Late', tag: `SUP2-${run}`, legalEntityId: ids.entity, supplierId: id }).expect(400);
    const v = (await api('it', 'get', `/lifecycle/assets/${asset}`).expect(200)).body.asset.version;
    await api('it', 'put', `/lifecycle/assets/${asset}`).send({ category: 'Laptop', name: 'Supplied laptop (spare)', tag, legalEntityId: ids.entity, locationId: ids.blr, version: v }).expect(200);
    expect((await api('it', 'get', `/lifecycle/assets/${asset}`).expect(200)).body.asset.supplier).toBe(sup.name);
    // Made active again for the contracts below; every change is audited.
    await api('it', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, retired: false, version: 2 }).expect(200);
    const acts = (await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'it_supplier', entityId: id }, orderBy: { createdAt: 'asc' } }))).map((x) => x.action);
    expect(acts).toEqual(['asset.supplier.added', 'asset.supplier.updated', 'asset.supplier.retired', 'asset.supplier.updated', 'asset.supplier.restored']);
    // Another company: nothing to see, nothing to change, nothing to pick.
    expect((await api('adminB', 'get', '/lifecycle/asset-suppliers').expect(200)).body.rows).toHaveLength(0);
    await api('adminB', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, version: 3 }).expect(404);
    await api('adminB', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Theirs', tag: `SUPB-${run}`, supplierId: id }).expect(400);
  });

  it('IT assets part 3 (2717): contracts with their place, value for money holders only, covered assets with a cap', async () => {
    const o = { organizationId: org.A.id };
    const sup = (await api('it', 'post', '/lifecycle/asset-suppliers').send({ name: `HCL Services ${run}`, contacts: [] }).expect(201)).body.id as string;
    // A Pune site IT person: asset.view and asset.manage on that location only (a grant), signed in fresh.
    const pune = await inA((tx) => tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: `Pune ${run}`, code: `P${run.slice(0, 4)}`, address: {}, country: 'IN', state: 'IN-MH', timezone: 'Asia/Kolkata' } }));
    const puneIt = await inA(async (tx) => {
      const u = await tx.user.create({ data: { ...o, email: `pune-it@life6c-${run}.test`, name: `Pune IT ${run}`, passwordHash: await argon2.hash(PASSWORD), role: 'panel', permissionProfileId: (await tx.permissionProfile.create({ data: { ...o, name: `pune-none-${run}`, permissionsJson: '[]' } })).id } });
      const role = await tx.permissionProfile.create({ data: { ...o, name: `asset-pune-${run}`, permissionsJson: JSON.stringify(['asset.view', 'asset.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: u.id, permissionProfileId: role.id, scopeType: 'location', locationId: pune.id, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Pune IT', grantedBy: users.adminA } });
      return u.id;
    });
    const puneToken = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `pune-it@life6c-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken as string;
    const asPune = (method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${puneToken}`);
    const add = async (tag: string, locationId: string) => (await api('it', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: `Covered ${tag}`, tag: `${tag}-${run}`, legalEntityId: ids.entity, locationId }).expect(201)).body.id as string;
    const [b1, b2, b3, p1] = [await add('CB1', ids.blr), await add('CB2', ids.blr), await add('CB3', ids.blr), await add('CP1', pune.id)];
    const body = { kind: 'amc', number: `AMC-${run}`, supplierId: sup, legalEntityId: ids.entity, locationId: ids.blr, startsOn: '2026-01-01', months: 12, renewal: 'tacit', noticeDays: 30, supportHours: 'Mon to Sat, 9:00 to 18:00', value: '120000.00', assetCap: 2, assetIds: [b1, b2] };
    const k = (await api('it', 'post', '/lifecycle/asset-contracts').send(body).expect(201)).body.id as string;
    ids.contract = k;
    const rowsOf = async (r: request.Test) => (await r.expect(200)).body.rows as { id: string }[];
    const row = async (who: Who | 'pune', id = k) => (await rowsOf(who === 'pune' ? asPune('get', '/lifecycle/asset-contracts') : api(who, 'get', '/lifecycle/asset-contracts'))).find((r) => r.id === id) as Record<string, any> | undefined;
    expect(await row('it')).toMatchObject({ number: `AMC-${run}`, supplier: `HCL Services ${run}`, place: 'Bengaluru', startsOn: '2026-01-01', endsOn: '2026-12-31', noticeOn: '2026-12-01', renewal: 'tacit', value: '120000.00', assetCap: 2, hiddenAssets: 0, status: 'active', canManage: true });
    expect((await row('it'))!.assets.map((a: { id: string }) => a.id).sort()).toEqual([b1, b2].sort());
    // Answer 2711: the value for Finance (asset.finance.view) and the managers; an asset.view agent gets no value at all.
    expect((await row('fin'))!.value).toBe('120000.00');
    const seen = await row('agent');
    expect(seen).not.toHaveProperty('value');
    expect(seen!.canManage).toBe(false);
    // The asset page lists the contracts covering the device.
    expect((await api('agent', 'get', `/lifecycle/assets/${b1}`).expect(200)).body.contracts).toEqual([{ id: k, kind: 'amc', number: `AMC-${run}`, supplier: `HCL Services ${run}`, endsOn: '2026-12-31', renewal: 'tacit', status: 'active' }]);
    expect((await api('agent', 'get', `/lifecycle/assets/${b3}`).expect(200)).body.contracts).toEqual([]);
    // Negative: no key, view only, the cap, bad values, a stale version, the same number twice.
    await api('ravi', 'get', '/lifecycle/asset-contracts').expect(403);
    await api('agent', 'post', '/lifecycle/asset-contracts').send({ ...body, number: `X-${run}` }).expect(403);
    await api('it', 'put', `/lifecycle/asset-contracts/${k}`).send({ ...body, assetIds: [b1, b2, b3], version: 1 }).expect(400);
    await api('it', 'post', '/lifecycle/asset-contracts').send({ ...body, number: `Y-${run}`, months: 0 }).expect(400);
    await api('it', 'post', '/lifecycle/asset-contracts').send({ ...body, number: `Y-${run}`, renewal: 'auto' }).expect(400);
    await api('it', 'post', '/lifecycle/asset-contracts').send({ ...body, number: `amc-${run}` }).expect(409);
    await api('it', 'put', `/lifecycle/asset-contracts/${k}`).send({ ...body, months: 24, assetCap: 3, assetIds: [b1, b2, b3], version: 1 }).expect(200);
    expect(await row('it')).toMatchObject({ endsOn: '2027-12-31', noticeOn: '2027-12-01' });
    await api('it', 'put', `/lifecycle/asset-contracts/${k}`).send({ ...body, version: 1 }).expect(409);
    // The Pune IT person (Pune only): cannot see or change the Bengaluru contract, cannot keep one with no place; keeps a Pune one.
    expect(await row('pune')).toBeUndefined();
    expect(puneIt).toBeTruthy();
    await asPune('put', `/lifecycle/asset-contracts/${k}`).send({ ...body, version: 2 }).expect(404);
    await asPune('post', '/lifecycle/asset-contracts').send({ ...body, number: `K-${run}`, assetIds: [] }).expect(403);
    await asPune('post', '/lifecycle/asset-contracts').send({ ...body, number: `K-${run}`, legalEntityId: null, locationId: null, assetIds: [] }).expect(403);
    await asPune('post', '/lifecycle/asset-contracts').send({ ...body, number: `K-${run}`, locationId: pune.id, assetIds: [b1] }).expect(400);
    const kp = (await asPune('post', '/lifecycle/asset-contracts').send({ ...body, number: `K-${run}`, locationId: pune.id, assetCap: null, assetIds: [p1] }).expect(201)).body.id as string;
    // IT adds a Bengaluru device to the Pune contract: The Pune IT person sees it only as a count, and saving keeps it.
    await api('it', 'put', `/lifecycle/asset-contracts/${kp}`).send({ ...body, number: `K-${run}`, locationId: pune.id, assetCap: null, assetIds: [p1, b3], version: 1 }).expect(200);
    expect(await row('pune', kp)).toMatchObject({ hiddenAssets: 1, assets: [{ id: p1 }] });
    await asPune('put', `/lifecycle/asset-contracts/${kp}`).send({ ...body, number: `K-${run}`, locationId: pune.id, assetCap: null, assetIds: [p1], supportHours: '24 x 7', version: 2 }).expect(200);
    expect((await row('it', kp))!.assets.map((a: { id: string }) => a.id).sort()).toEqual([p1, b3].sort());
    // A retired supplier is not offered for a new contract.
    await api('it', 'put', `/lifecycle/asset-suppliers/${sup}`).send({ name: `HCL Services ${run}`, contacts: [], retired: true, version: 1 }).expect(200);
    await api('it', 'post', '/lifecycle/asset-contracts').send({ ...body, number: `Z-${run}` }).expect(400);
    await api('it', 'put', `/lifecycle/asset-suppliers/${sup}`).send({ name: `HCL Services ${run}`, contacts: [], retired: false, version: 2 }).expect(200);
    // Audited: added, then one change (refused saves leave nothing).
    expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_contract', entityId: k }, orderBy: { createdAt: 'asc' } }))).map((x) => x.action)).toEqual(['asset.contract.added', 'asset.contract.updated']);
    // Another company: nothing.
    expect((await api('adminB', 'get', '/lifecycle/asset-contracts').expect(200)).body.rows).toHaveLength(0);
    await api('adminB', 'put', `/lifecycle/asset-contracts/${k}`).send({ ...body, version: 2 }).expect(404);
  });

  it('IT assets follow-up (2823): only company-wide asset managers retire or restore a supplier; site managers add and edit', async () => {
    const o = { organizationId: org.A.id };
    // A Bengaluru site asset manager (a location grant), signed in fresh.
    await inA(async (tx) => {
      const u = await tx.user.create({ data: { ...o, email: `site-it@life6c-${run}.test`, name: `Site IT ${run}`, passwordHash: await argon2.hash(PASSWORD), role: 'panel', permissionProfileId: (await tx.permissionProfile.create({ data: { ...o, name: `site-none-${run}`, permissionsJson: '[]' } })).id } });
      const role = await tx.permissionProfile.create({ data: { ...o, name: `asset-site-${run}`, permissionsJson: JSON.stringify(['asset.view', 'asset.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: u.id, permissionProfileId: role.id, scopeType: 'location', locationId: ids.blr, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Bengaluru IT', grantedBy: users.adminA } });
    });
    const siteToken = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `site-it@life6c-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken as string;
    const asSite = (method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${siteToken}`);
    const sup = { name: `Site Supplier ${run}`, contacts: [] };
    // The site manager adds and edits (the status untouched or sent unchanged) but may not retire.
    const id = (await asSite('post', '/lifecycle/asset-suppliers').send(sup).expect(201)).body.id as string;
    const list = (await asSite('get', '/lifecycle/asset-suppliers').expect(200)).body;
    expect(list).toMatchObject({ canManage: true, canRetire: false });
    await asSite('put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, notes: 'Toner', version: 1 }).expect(200);
    await asSite('put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, notes: 'Toner and paper', retired: false, version: 2 }).expect(200);
    await asSite('put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, retired: true, version: 3 }).expect(403);
    const row = async () => (await api('it', 'get', '/lifecycle/asset-suppliers').expect(200)).body.rows.find((r: { id: string }) => r.id === id);
    expect(await row()).toMatchObject({ retired: false, notes: 'Toner and paper', version: 3 });
    // The company-wide manager retires it; the site manager cannot restore it but still edits it.
    expect((await api('it', 'get', '/lifecycle/asset-suppliers').expect(200)).body.canRetire).toBe(true);
    await api('it', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, retired: true, version: 3 }).expect(200);
    await asSite('put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, retired: false, version: 4 }).expect(403);
    await asSite('put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, notes: 'Toner only', version: 4 }).expect(200);
    expect(await row()).toMatchObject({ retired: true, notes: 'Toner only' });
    await api('it', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, retired: false, version: 5 }).expect(200);
    expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'it_supplier', entityId: id, action: { in: ['asset.supplier.retired', 'asset.supplier.restored'] } }, orderBy: { createdAt: 'asc' } }))).map((x) => [x.action, x.actorUserId])).toEqual([['asset.supplier.retired', users.it], ['asset.supplier.restored', users.it]]);
    // Another company: not found.
    await api('adminB', 'put', `/lifecycle/asset-suppliers/${id}`).send({ ...sup, retired: true, version: 6 }).expect(404);
  });

  it('IT assets part 3 (2714 contracts): tacit renews, express ends, owners told once at the notice date (a company setting)', async () => {
    const alerts = app.get(AssetAlertsService);
    const o = { organizationId: org.A.id };
    const sup = (await api('it', 'post', '/lifecycle/asset-suppliers').send({ name: `Notice Co ${run}`, contacts: [] }).expect(201)).body.id as string;
    const add = async (n: string, over: Record<string, unknown>) => (await api('it', 'post', '/lifecycle/asset-contracts').send({ kind: 'support', number: `${n}-${run}`, supplierId: sup, legalEntityId: ids.entity, locationId: ids.blr, months: 1, renewal: 'tacit', noticeDays: 30, assetIds: [], ...over }).expect(201)).body.id as string;
    const tacitStart = addDays(today, -400);
    const renews = await add('TAC', { startsOn: tacitStart, months: 12 }); // ended about 35 days ago: renews once
    const ends = await add('EXP', { startsOn: addDays(today, -200), months: 6, renewal: 'express' }); // ended: ends
    const soon = await add('SOON', { startsOn: addDays(today, -10) }); // ends in about 20 days; notice date passed
    const later = await add('LATER', { startsOn: addDays(today, -10), months: 2 }); // notice date in about 20 days
    const nowhere = await add('ALL', { startsOn: addDays(today, -10), legalEntityId: null, locationId: null }); // company-wide
    const told = (k: string) => inA((tx) => tx.userNotification.findMany({ where: { type: 'asset.contract.notice', entityId: k }, select: { recipientUserId: true } })).then((r) => r.map((x) => x.recipientUserId));
    const acts = (k: string) => inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_contract', entityId: k }, orderBy: { createdAt: 'asc' } })).then((r) => r.map((x) => x.action));
    const row = async (k: string) => (await api('it', 'get', '/lifecycle/asset-contracts').expect(200)).body.rows.find((r: { id: string }) => r.id === k);
    // A site manager of Bengaluru only, to check place scoping (a grant).
    const blrIt = await inA(async (tx) => {
      const u = await tx.user.create({ data: { ...o, email: `blr-it@life6c-${run}.test`, name: `Bengaluru IT ${run}`, passwordHash: 'not-used', role: 'panel' } });
      const role = await tx.permissionProfile.create({ data: { ...o, name: `asset-blr-${run}`, permissionsJson: JSON.stringify(['asset.view', 'asset.manage']) } });
      await tx.roleGrant.create({ data: { ...o, userId: u.id, permissionProfileId: role.id, scopeType: 'location', locationId: ids.blr, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Bengaluru IT', grantedBy: users.adminA } });
      return u.id;
    });
    await alerts.contractSweep();
    // Tacit: renewed for the same length, recorded and audited; express: ended.
    expect(await row(renews)).toMatchObject({ status: 'active', renewals: 1, endsOn: contractEndsOn(tacitStart, 12, 1) });
    expect(await acts(renews)).toEqual(['asset.contract.added', 'asset.contract.renewed']);
    expect(await row(ends)).toMatchObject({ status: 'ended', renewals: 0 });
    expect(await acts(ends)).toEqual(['asset.contract.added', 'asset.contract.ended']);
    // The notice date has come: the asset managers of the place are told (company-wide ones and Bengaluru's), once.
    const first = await told(soon);
    expect(first).toEqual(expect.arrayContaining([users.hr, users.it, users.adminA, blrIt]));
    for (const who of ['fin', 'agent', 'ravi'] as const) expect(first).not.toContain(users[who]);
    expect(await acts(soon)).toEqual(['asset.contract.added', 'asset.contract.notice.alerted']);
    // A place-less contract: company-wide managers only.
    const all = await told(nowhere);
    expect(all).toEqual(expect.arrayContaining([users.hr, users.it]));
    expect(all).not.toContain(blrIt);
    // Not yet at its notice date (setting 0 = on the notice date); ended and renewed-far-ahead ones are not told.
    expect(await told(later)).toEqual([]);
    expect(await told(ends)).toEqual([]);
    expect(await told(renews)).toEqual([]);
    // A second run tells nobody again and renews nothing again.
    await alerts.contractSweep();
    expect((await told(soon)).length).toBe(first.length);
    expect((await row(renews)).renewals).toBe(1);
    // The company setting: 30 days before the notice date reaches the later one; off tells nobody.
    const lead = await inA((tx) => tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'asset.contract_alert_days', value: '30' } }));
    try {
      await alerts.contractSweep();
      expect(await told(later)).toContain(users.it);
      await inA((tx) => tx.setting.update({ where: { id: lead.id }, data: { value: 'off' } }));
      const quiet = await add('QUIET', { startsOn: addDays(today, -10) });
      await alerts.contractSweep();
      expect(await told(quiet)).toEqual([]);
    } finally {
      await inA((tx) => tx.setting.update({ where: { id: lead.id }, data: { value: '0' } }));
    }
    // Another company's people are never told.
    expect(await told(soon)).not.toContain(users.adminB);
  });

  it('IT assets follow-up (2824): Renew adds one more length to an express contract, audited; tacit refused; wrong key 403; another company 404', async () => {
    const sup = (await api('it', 'post', '/lifecycle/asset-suppliers').send({ name: `Renew Co ${run}`, contacts: [] }).expect(201)).body.id as string;
    const add = async (n: string, over: Record<string, unknown>) => (await api('it', 'post', '/lifecycle/asset-contracts').send({ kind: 'insurance', number: `${n}-${run}`, supplierId: sup, legalEntityId: ids.entity, locationId: ids.blr, startsOn: '2026-03-01', months: 12, renewal: 'express', noticeDays: 30, assetIds: [], ...over }).expect(201)).body.id as string;
    const exp = await add('RNX', {});
    const tacit = await add('RNT', { renewal: 'tacit' });
    const row = async (k: string) => (await api('it', 'get', '/lifecycle/asset-contracts').expect(200)).body.rows.find((r: { id: string }) => r.id === k);
    const renew = (who: Who, k: string, version: number) => api(who, 'post', `/lifecycle/asset-contracts/${k}/renew`).send({ version });
    expect(await row(exp)).toMatchObject({ startsOn: '2026-03-01', endsOn: '2027-02-28', renewals: 0 });
    // Renewed: the start stays, the end moves by the length, recorded and audited.
    expect((await renew('it', exp, 1).expect(200)).body).toMatchObject({ endsOn: '2028-02-29', renewals: 1 });
    expect(await row(exp)).toMatchObject({ startsOn: '2026-03-01', months: 12, endsOn: '2028-02-29', noticeOn: '2028-01-30', renewals: 1, status: 'active', version: 2 });
    const audits = await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_contract', entityId: exp }, orderBy: { createdAt: 'asc' } }));
    expect(audits.map((x) => x.action)).toEqual(['asset.contract.added', 'asset.contract.renewed']);
    expect(JSON.parse(audits[1].metadataJson ?? '{}')).toMatchObject({ from: '2027-02-28', to: '2028-02-29', renewals: 1, by: 'hand' });
    // Negative: a stale version, a tacit contract (it renews by itself), no manage key, another company.
    await renew('it', exp, 1).expect(409);
    await renew('it', tacit, 1).expect(400);
    await renew('agent', exp, 2).expect(403);
    await renew('fin', exp, 2).expect(403);
    await renew('ravi', exp, 2).expect(403);
    await renew('adminB', exp, 2).expect(404);
    expect(await row(tacit)).toMatchObject({ endsOn: '2027-02-28', renewals: 0 });
    expect(await row(exp)).toMatchObject({ endsOn: '2028-02-29', renewals: 1 });
    // Editing the contract later keeps its renewals (the end stays two lengths on).
    await api('it', 'put', `/lifecycle/asset-contracts/${exp}`).send({ kind: 'insurance', number: `RNX-${run}`, supplierId: sup, legalEntityId: ids.entity, locationId: ids.blr, startsOn: '2026-03-01', months: 12, renewal: 'express', noticeDays: 15, assetIds: [], version: 2 }).expect(200);
    expect(await row(exp)).toMatchObject({ endsOn: '2028-02-29', renewals: 1, noticeDays: 15 });
  });

  it('IT assets part 4 (2718): licences with seats to people and devices; over quota refused unless allowed; cost for money holders only', async () => {
    const sup = (await api('it', 'post', '/lifecycle/asset-suppliers').send({ name: `Licence Co ${run}`, contacts: [] }).expect(201)).body.id as string;
    const dev = (await api('it', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Seat laptop', tag: `SL-${run}`, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
    const body = { software: 'Microsoft 365', softwareVersion: 'E3', supplierId: sup, legalEntityId: ids.entity, locationId: ids.blr, seats: 2, expiresOn: '2027-03-31', cost: '96000.00', allowOverQuota: false };
    const l = (await api('it', 'post', '/lifecycle/asset-licences').send(body).expect(201)).body.id as string;
    const row = async (who: Who, id = l) => (await api(who, 'get', '/lifecycle/asset-licences').expect(200)).body.rows.find((r: { id: string }) => r.id === id) as Record<string, any> | undefined;
    expect(await row('it')).toMatchObject({ software: 'Microsoft 365', softwareVersion: 'E3', supplier: `Licence Co ${run}`, place: 'Bengaluru', seats: 2, used: 0, expiresOn: '2027-03-31', cost: '96000.00', allowOverQuota: false, holders: [], canManage: true });
    // Answer 2711: the cost for Finance and the managers; an asset.view agent gets none and cannot change it.
    expect((await row('fin'))!.cost).toBe('96000.00');
    expect(await row('agent')).not.toHaveProperty('cost');
    // Seats: a person and a device fill the two seats; a third is refused (no over quota); the same holder twice is refused.
    const give = (who: Who, x: Record<string, string>, id = l) => api(who, 'post', `/lifecycle/asset-licences/${id}/seats`).send(x);
    await give('it', { employeeId: emp.sita }).expect(201);
    await give('it', { employeeId: emp.sita }).expect(409);
    await give('it', { assetId: dev }).expect(201);
    await give('it', { employeeId: emp.mgr }).expect(409);
    await give('it', { employeeId: emp.mgr, assetId: dev }).expect(400);
    await give('it', {}).expect(400);
    await give('agent', { employeeId: emp.mgr }).expect(403);
    await give('ravi', { employeeId: emp.mgr }).expect(403);
    await api('adminB', 'post', `/lifecycle/asset-licences/${l}/seats`).send({ employeeId: emp.mgr }).expect(404);
    expect(await row('it')).toMatchObject({ used: 2, seats: 2 });
    // Fewer seats than in use is refused; allowing over quota lets a third seat in, shown as used beyond the seats.
    await api('it', 'put', `/lifecycle/asset-licences/${l}`).send({ ...body, seats: 1, version: 1 }).expect(400);
    await api('it', 'put', `/lifecycle/asset-licences/${l}`).send({ ...body, allowOverQuota: true, version: 1 }).expect(200);
    expect((await give('it', { employeeId: emp.mgr }).expect(201)).body.overQuota).toBe(true);
    const r = (await row('it'))!;
    expect(r).toMatchObject({ used: 3, seats: 2, allowOverQuota: true });
    expect(r.holders.map((h: { kind: string; name: string }) => `${h.kind}:${h.name}`).sort()).toEqual([`device:Seat laptop`, `person:Divya ${run}`, `person:Sita ${run}`].sort());
    await api('it', 'put', `/lifecycle/asset-licences/${l}`).send({ ...body, allowOverQuota: true, version: 1 }).expect(409); // a stale version
    // The device's page lists its seat; the person sees their seat under My assets.
    expect((await api('agent', 'get', `/lifecycle/assets/${dev}`).expect(200)).body.licences).toEqual([expect.objectContaining({ id: l, software: 'Microsoft 365', softwareVersion: 'E3', expiresOn: '2027-03-31', givenOn: today })]);
    expect((await api('sita', 'get', '/lifecycle/me/assets').expect(200)).body.seats).toEqual([expect.objectContaining({ software: 'Microsoft 365', softwareVersion: 'E3', givenOn: today })]);
    // Freeing a seat: the seat count drops; freeing it again is refused; a view-only agent may not.
    const devSeat = r.holders.find((h: { kind: string }) => h.kind === 'device').seatId as string;
    await api('agent', 'post', `/lifecycle/asset-licences/${l}/seats/${devSeat}/free`).send({}).expect(403);
    await api('it', 'post', `/lifecycle/asset-licences/${l}/seats/${devSeat}/free`).send({ reason: 'Laptop wiped' }).expect(200);
    await api('it', 'post', `/lifecycle/asset-licences/${l}/seats/${devSeat}/free`).send({}).expect(409);
    expect((await row('it'))!.used).toBe(2);
    expect((await api('agent', 'get', `/lifecycle/assets/${dev}`).expect(200)).body.licences).toEqual([]);
    // Validation, a retired-or-unknown supplier, another company.
    await api('it', 'post', '/lifecycle/asset-licences').send({ ...body, seats: 0 }).expect(400);
    await api('it', 'post', '/lifecycle/asset-licences').send({ ...body, software: '<b>x</b>' }).expect(400);
    await api('it', 'post', '/lifecycle/asset-licences').send({ ...body, supplierId: randomUUID() }).expect(400);
    await api('agent', 'post', '/lifecycle/asset-licences').send(body).expect(403);
    await api('ravi', 'get', '/lifecycle/asset-licences').expect(403);
    expect((await api('adminB', 'get', '/lifecycle/asset-licences').expect(200)).body.rows).toHaveLength(0);
    await api('adminB', 'put', `/lifecycle/asset-licences/${l}`).send({ ...body, version: 2 }).expect(404);
    // Audited.
    expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_licence', entityId: l }, orderBy: { createdAt: 'asc' } }))).map((x) => x.action)).toEqual(['asset.licence.added', 'asset.licence.seat.given', 'asset.licence.seat.given', 'asset.licence.updated', 'asset.licence.seat.given', 'asset.licence.seat.freed']);
    ids.licence = l;
  });

  it("IT assets part 4 (2718): a leaver's seats join the IT clearance list; clearing the item frees the seat; a seat given to a leaver joins at once", async () => {
    const hireOne = async (given: string, code: string) => (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: given, familyName: run, employeeCode: code, joinedOn: '2026-04-06', workEmail: `${code.toLowerCase()}@life6c-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: emp.mgr } }).expect(201)).body.id as string;
    const [lata, mohan] = [await hireOne('Lata', 'EX-L01'), await hireOne('Mohan', 'EX-L02')];
    const body = { software: 'AutoCAD', softwareVersion: '2026', legalEntityId: ids.entity, locationId: ids.blr, seats: 5, allowOverQuota: false };
    const l = (await api('it', 'post', '/lifecycle/asset-licences').send(body).expect(201)).body.id as string;
    await api('it', 'post', `/lifecycle/asset-licences/${l}/seats`).send({ employeeId: lata }).expect(201);
    const itemsOf = async () => ((await api('it', 'get', '/lifecycle/clearance/mine').expect(200)).body.rows as { id: string; title: string; status: string; version: number; department: string }[]).filter((i) => i.title.includes('AutoCAD 2026'));
    expect(await itemsOf()).toEqual([]);
    // Lata leaves: her seat joins the IT clearance list (the IT and Admin team).
    await api('hr', 'post', '/lifecycle/exits').send({ employeeId: lata, exitType: 'end_of_contract', lwd: addDays(today, 20), reasonText: 'Contract ends' }).expect(201);
    const [item] = await itemsOf();
    expect(item).toMatchObject({ title: 'Free the AutoCAD 2026 licence seat', department: 'it', status: 'open' });
    expect((await api('it', 'get', '/lifecycle/asset-licences').expect(200)).body.rows.find((r: { id: string }) => r.id === l).holders).toEqual([expect.objectContaining({ kind: 'person', name: `Lata ${run}`, leaving: true })]);
    // Clearing the item frees the seat, audited on the licence.
    await api('it', 'post', `/lifecycle/clearance/${item.id}/sign-off`).send({ action: 'clear', version: item.version }).expect(200);
    expect((await api('it', 'get', '/lifecycle/asset-licences').expect(200)).body.rows.find((r: { id: string }) => r.id === l)).toMatchObject({ used: 0, holders: [] });
    expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_licence', entityId: l }, orderBy: { createdAt: 'asc' } }))).map((x) => x.action)).toEqual(['asset.licence.added', 'asset.licence.seat.given', 'asset.licence.seat.freed']);
    // Mohan is already leaving: a seat given now joins his clearance at once; freeing the seat signs the item off.
    await api('hr', 'post', '/lifecycle/exits').send({ employeeId: mohan, exitType: 'end_of_contract', lwd: addDays(today, 20), reasonText: 'Contract ends' }).expect(201);
    const seat = (await api('it', 'post', `/lifecycle/asset-licences/${l}/seats`).send({ employeeId: mohan }).expect(201)).body.id as string;
    const open = (await itemsOf()).filter((i) => i.status === 'open');
    expect(open).toHaveLength(1);
    await api('it', 'post', `/lifecycle/asset-licences/${l}/seats/${seat}/free`).send({ reason: 'Account closed' }).expect(200);
    expect((await itemsOf()).filter((i) => i.status === 'open')).toHaveLength(0);
    // Another company cannot free it.
    await api('adminB', 'post', `/lifecycle/asset-licences/${l}/seats/${seat}/free`).send({}).expect(404);
  });

  it("IT assets follow-up (2825): waiving a leaver's licence-seat item frees the seat too, audited; the seat count drops", async () => {
    const omar = (await api('adminA', 'post', '/people/employees').send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: 'Omar', familyName: run, employeeCode: 'EX-L03', joinedOn: '2026-04-06', workEmail: `ex-l03@life6c-${run}.test`, assignment: { locationId: ids.blr, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: emp.mgr } }).expect(201)).body.id as string;
    const l = (await api('it', 'post', '/lifecycle/asset-licences').send({ software: 'Figma', softwareVersion: 'Pro', legalEntityId: ids.entity, locationId: ids.blr, seats: 3, allowOverQuota: false }).expect(201)).body.id as string;
    await api('it', 'post', `/lifecycle/asset-licences/${l}/seats`).send({ employeeId: omar }).expect(201);
    await api('it', 'post', `/lifecycle/asset-licences/${l}/seats`).send({ employeeId: emp.sita }).expect(201);
    const lic = async () => (await api('it', 'get', '/lifecycle/asset-licences').expect(200)).body.rows.find((r: { id: string }) => r.id === l);
    expect((await lic()).used).toBe(2);
    await api('hr', 'post', '/lifecycle/exits').send({ employeeId: omar, exitType: 'end_of_contract', lwd: addDays(today, 20), reasonText: 'Contract ends' }).expect(201);
    const item = ((await api('it', 'get', '/lifecycle/clearance/mine').expect(200)).body.rows as { id: string; title: string; status: string; version: number }[]).find((i) => i.title.includes('Figma Pro') && i.status === 'open')!;
    // Negative: a waiver needs its reason; another company cannot touch it; nothing is freed by a refused call.
    await api('it', 'post', `/lifecycle/clearance/${item.id}/sign-off`).send({ action: 'waive', version: item.version }).expect(400);
    await api('adminB', 'post', `/lifecycle/clearance/${item.id}/sign-off`).send({ action: 'waive', note: 'Left', version: item.version }).expect((r) => expect([403, 404]).toContain(r.status));
    expect((await lic()).used).toBe(2);
    // Waived: the seat is freed (Sita keeps hers), audited on the licence as a waiver.
    await api('it', 'post', `/lifecycle/clearance/${item.id}/sign-off`).send({ action: 'waive', note: 'Account already closed by the vendor', version: item.version }).expect(200);
    const after = await lic();
    expect(after.used).toBe(1);
    expect(after.holders).toEqual([expect.objectContaining({ kind: 'person', name: `Sita ${run}` })]);
    const freed = await inA((tx) => tx.auditLog.findFirstOrThrow({ where: { entityType: 'asset_licence', entityId: l, action: 'asset.licence.seat.freed' } }));
    expect(JSON.parse(freed.metadataJson ?? '{}')).toMatchObject({ clearance: 'waive' });
    expect(await inA((tx) => tx.assetLicenceSeat.findFirstOrThrow({ where: { licenceId: l, freedOn: { not: null } } }))).toMatchObject({ freeReason: 'Account already closed by the vendor' });
  });

  it("IT assets follow-up (2826): a person's licence seats on the PPL-03 Assets tab for asset.view over the licence and their managers", async () => {
    const o = { organizationId: org.A.id };
    const seatsOf = async (who: Who) => (await api(who, 'get', `/lifecycle/people/${emp.sita}/assets`).expect(200)).body.seats as { software: string; softwareVersion: string | null; givenOn: string }[];
    const m365 = expect.objectContaining({ software: 'Microsoft 365', softwareVersion: 'E3', expiresOn: '2027-03-31', givenOn: today });
    // asset.view holders (company-wide), the manager and the person see Sita's seat.
    expect(await seatsOf('agent')).toEqual(expect.arrayContaining([m365]));
    expect(await seatsOf('mgr')).toEqual(expect.arrayContaining([m365]));
    expect(await seatsOf('sita')).toEqual(expect.arrayContaining([m365]));
    // Negative: a peer and another company: not found; asset.view at another place only: the person, but not the seat.
    await api('meena', 'get', `/lifecycle/people/${emp.sita}/assets`).expect(404);
    await api('adminB', 'get', `/lifecycle/people/${emp.sita}/assets`).expect(404);
    const far = await inA(async (tx) => {
      const loc = await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: `Mysuru ${run}`, code: `M${run.slice(0, 4)}`, address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } });
      const u = await tx.user.create({ data: { ...o, email: `far-it@life6c-${run}.test`, name: `Far IT ${run}`, passwordHash: await argon2.hash(PASSWORD), role: 'panel', permissionProfileId: (await tx.permissionProfile.create({ data: { ...o, name: `far-none-${run}`, permissionsJson: '[]' } })).id } });
      const role = await tx.permissionProfile.create({ data: { ...o, name: `asset-far-${run}`, permissionsJson: JSON.stringify(['asset.view']) } });
      await tx.roleGrant.create({ data: { ...o, userId: u.id, permissionProfileId: role.id, scopeType: 'location', locationId: loc.id, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'Mysuru IT', grantedBy: users.adminA } });
      return u.id;
    });
    expect(far).toBeTruthy();
    const farToken = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `far-it@life6c-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken as string;
    const farView = (await request(server()).get(`/api/v1/lifecycle/people/${emp.sita}/assets`).set('Authorization', `Bearer ${farToken}`).expect(200)).body;
    expect(farView.seats).toEqual([]);
    // A freed seat leaves the tab.
    const l = (await api('it', 'get', '/lifecycle/asset-licences').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.licence);
    const sitaSeat = l.holders.find((h: { name: string }) => h.name === `Sita ${run}`).seatId as string;
    await api('it', 'post', `/lifecycle/asset-licences/${ids.licence}/seats/${sitaSeat}/free`).send({ reason: 'Moved team' }).expect(200);
    expect(await seatsOf('mgr')).not.toEqual(expect.arrayContaining([m365]));
  });

  it('IT assets part 4 (2718): asset managers of the place are told once before a licence expires (a company setting)', async () => {
    const alerts = app.get(AssetAlertsService);
    const o = { organizationId: org.A.id };
    const add = async (software: string, expiresOn: string | null, place = { legalEntityId: ids.entity, locationId: ids.blr }) => (await api('it', 'post', '/lifecycle/asset-licences').send({ software: `${software} ${run}`, seats: 3, expiresOn, allowOverQuota: false, ...place }).expect(201)).body.id as string;
    const soon = await add('Soon', addDays(today, 10));
    const later = await add('Later', addDays(today, 60));
    const never = await add('Perpetual', null);
    const all = await add('Everywhere', addDays(today, 5), { legalEntityId: null as unknown as string, locationId: null as unknown as string });
    const told = (k: string) => inA((tx) => tx.userNotification.findMany({ where: { type: 'asset.licence.expiring', entityId: k }, select: { recipientUserId: true } })).then((r) => r.map((x) => x.recipientUserId));
    await alerts.licenceSweep();
    const first = await told(soon);
    expect(first).toEqual(expect.arrayContaining([users.hr, users.it, users.adminA]));
    for (const who of ['fin', 'agent', 'ravi', 'adminB'] as const) expect(first).not.toContain(users[who]);
    expect(await told(all)).toEqual(expect.arrayContaining([users.it]));
    expect(await told(later)).toEqual([]);
    expect(await told(never)).toEqual([]);
    expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_licence', entityId: soon } }))).map((x) => x.action)).toContain('asset.licence.expiry.alerted');
    // Once: a second run tells nobody again.
    await alerts.licenceSweep();
    expect((await told(soon)).length).toBe(first.length);
    // The company setting: 90 days reaches the later one; off tells nobody.
    const s = await inA((tx) => tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'asset.licence_alert_days', value: '90' } }));
    try {
      await alerts.licenceSweep();
      expect(await told(later)).toContain(users.it);
      await inA((tx) => tx.setting.update({ where: { id: s.id }, data: { value: 'off' } }));
      const quiet = await add('Quiet', addDays(today, 3));
      await alerts.licenceSweep();
      expect(await told(quiet)).toEqual([]);
    } finally {
      await inA((tx) => tx.setting.update({ where: { id: s.id }, data: { value: '30' } }));
    }
  });

  it('IT assets part 5 (2715): bookable assets, the free-between search, clashes and limits refused, hand-over is an issue, take-back a return', async () => {
    const o = { organizationId: org.A.id };
    const pj = (await api('it', 'post', '/lifecycle/assets').send({ category: 'Laptop', name: 'Epson projector', tag: `PJ-${run}`, legalEntityId: ids.entity, locationId: ids.blr }).expect(201)).body.id as string;
    const free = async (who: Who, from: string, to: string, extra = '') => (await api(who, 'get', `/lifecycle/me/asset-bookings/free?from=${from}&to=${to}${extra}`).expect(200)).body;
    const book = (who: Who, body: Record<string, unknown>) => api(who, 'post', '/lifecycle/me/asset-bookings').send({ assetId: pj, repeat: 'none', ...body });
    // Not bookable yet: not offered, and a booking is refused.
    expect((await free('sita', addDays(today, 1), addDays(today, 2))).rows.map((r: { id: string }) => r.id)).not.toContain(pj);
    await book('sita', { startsOn: addDays(today, 1), endsOn: addDays(today, 2) }).expect(404);
    // Only asset managers of its place make it bookable: wrong key 403, another company 404.
    await api('agent', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: true }).expect(403);
    await api('sita', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: true }).expect(403);
    await api('adminB', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: true }).expect(404);
    await api('it', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: true }).expect(200);
    // A bookable asset is never issued from the register (only through a booking).
    await api('it', 'post', `/lifecycle/assets/${pj}/issue`).send({ employeeId: emp.ravi, issuedOn: today, condition: 'New' }).expect(409);
    const f = await free('sita', addDays(today, 1), addDays(today, 2));
    expect(f.rows.find((r: { id: string }) => r.id === pj)).toMatchObject({ tag: `PJ-${run}`, location: 'Bengaluru' });
    expect(f.categories.length).toBeGreaterThan(0);
    expect((await free('sita', addDays(today, 1), addDays(today, 2), `&locationId=${randomUUID()}`)).rows).toEqual([]);
    await api('sita', 'get', `/lifecycle/me/asset-bookings/free?from=${addDays(today, 2)}&to=${today}`).expect(400);
    // Too long (14 days by default), in the past: refused.
    expect((await book('sita', { startsOn: addDays(today, 1), endsOn: addDays(today, 15) }).expect(400)).body.message).toBe('A booking is at most 14 days.');
    await book('sita', { startsOn: addDays(today, -1), endsOn: today }).expect(400);
    // Sita books today to the day after tomorrow (no approval by default).
    const s1 = (await book('sita', { startsOn: today, endsOn: addDays(today, 2), purpose: 'Client demo' }).expect(201)).body;
    expect(s1).toMatchObject({ status: 'booked', seriesId: null });
    expect((await free('mgr', addDays(today, 1), addDays(today, 1))).rows.map((r: { id: string }) => r.id)).not.toContain(pj);
    // A daily repeat that clashes on one day refuses the whole set, naming the day.
    const clash = await book('mgr', { startsOn: addDays(today, 2), endsOn: addDays(today, 2), repeat: 'daily', until: addDays(today, 6) }).expect(409);
    expect(clash.body.message).toBe(`Epson projector (PJ-${run}) is already booked on ${addDays(today, 2)}. Nothing was booked.`);
    expect(await inA((tx) => tx.assetBooking.count({ where: { assetId: pj, status: 'booked' } }))).toBe(1);
    // A weekly repeat books each week as its own booking.
    const w = (await book('mgr', { startsOn: addDays(today, 7), endsOn: addDays(today, 7), repeat: 'weekly', until: addDays(today, 21) }).expect(201)).body;
    expect(w.ids).toHaveLength(3);
    // The database itself keeps live bookings apart.
    const sitaPerson = (await inA((tx) => tx.employee.findFirstOrThrow({ where: { id: emp.sita } }))).personId;
    await expect(inA((tx) => tx.assetBooking.create({ data: { ...o, assetId: pj, personId: sitaPerson, startsOn: new Date(`${addDays(today, 7)}T00:00:00Z`), endsOn: new Date(`${addDays(today, 7)}T00:00:00Z`), status: 'booked' } }))).rejects.toThrow();
    // My bookings: mine only.
    const mine = (await api('sita', 'get', '/lifecycle/me/asset-bookings').expect(200)).body;
    expect(mine).toMatchObject({ maxDays: 14, approval: false });
    expect(mine.rows).toEqual([expect.objectContaining({ id: s1.ids[0], tag: `PJ-${run}`, status: 'booked', purpose: 'Client demo' })]);
    await api('sita', 'post', `/lifecycle/me/asset-bookings/${w.ids[0]}/cancel`).send({}).expect(404);
    // IT's list: asset.view reads; no key 403; another company sees none.
    expect((await api('agent', 'get', '/lifecycle/asset-bookings').expect(200)).body.rows.filter((r: { assetId: string }) => r.assetId === pj)).toHaveLength(4);
    await api('ravi', 'get', '/lifecycle/asset-bookings').expect(403);
    expect((await api('adminB', 'get', '/lifecycle/asset-bookings').expect(200)).body.rows).toEqual([]);
    // Hand-over: wrong key 403, another company 404, not yet started 409; then an issue on the register.
    await api('agent', 'post', `/lifecycle/asset-bookings/${s1.ids[0]}/hand-over`).send({ condition: 'Good' }).expect(403);
    await api('adminB', 'post', `/lifecycle/asset-bookings/${s1.ids[0]}/hand-over`).send({ condition: 'Good' }).expect(404);
    await api('it', 'post', `/lifecycle/asset-bookings/${w.ids[0]}/hand-over`).send({ condition: 'Good' }).expect(409);
    const ho = (await api('it', 'post', `/lifecycle/asset-bookings/${s1.ids[0]}/hand-over`).send({ condition: 'Good, with remote' }).expect(200)).body;
    const x = await inA((tx) => tx.assetAssignment.findFirstOrThrow({ where: { id: ho.assignmentId } }));
    expect(x).toMatchObject({ assetId: pj, personId: sitaPerson, returnedOn: null, issueCondition: 'Good, with remote' });
    const reg = (await api('it', 'get', '/lifecycle/assets').expect(200)).body.rows.find((r: { id: string }) => r.id === pj);
    expect(reg).toMatchObject({ status: 'assigned', holder: expect.objectContaining({ name: `Sita ${run}` }) });
    await api('it', 'post', `/lifecycle/asset-bookings/${s1.ids[0]}/hand-over`).send({ condition: 'Good' }).expect(409);
    await api('sita', 'post', `/lifecycle/me/asset-bookings/${s1.ids[0]}/cancel`).send({}).expect(409);
    // Not bookable any more while bookings are live.
    await api('it', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: false }).expect(409);
    // The asset page: bookable, with its bookings.
    const page = (await api('agent', 'get', `/lifecycle/assets/${pj}`).expect(200)).body;
    expect(page.asset.bookable).toBe(true);
    expect(page.bookings.map((b: { status: string }) => b.status).sort()).toEqual(['booked', 'booked', 'booked', 'out']);
    // The day before it is due back the person is reminded; overdue, IT is told; once each, audited.
    const alerts = app.get(AssetAlertsService);
    await inA((tx) => tx.assetBooking.update({ where: { id: s1.ids[0] }, data: { endsOn: new Date(`${addDays(today, 1)}T00:00:00Z`) } }));
    const told = (type: string) => inA((tx) => tx.userNotification.findMany({ where: { type, entityId: s1.ids[0] }, select: { recipientUserId: true } })).then((r) => r.map((n) => n.recipientUserId));
    await alerts.bookingSweep();
    expect(await told('asset.booking.due')).toEqual([users.sita]);
    await alerts.bookingSweep();
    expect(await told('asset.booking.due')).toEqual([users.sita]);
    await inA((tx) => tx.assetBooking.update({ where: { id: s1.ids[0] }, data: { startsOn: new Date(`${addDays(today, -3)}T00:00:00Z`), endsOn: new Date(`${addDays(today, -1)}T00:00:00Z`) } }));
    await alerts.bookingSweep();
    const overdue = await told('asset.booking.overdue');
    expect(overdue).toEqual(expect.arrayContaining([users.it, users.hr]));
    for (const who of ['sita', 'agent', 'fin', 'adminB'] as const) expect(overdue).not.toContain(users[who]);
    await alerts.bookingSweep();
    expect((await told('asset.booking.overdue')).length).toBe(overdue.length);
    expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_booking', entityId: s1.ids[0] } }))).map((a) => a.action)).toEqual(expect.arrayContaining(['asset.booking.made', 'asset.booking.handed_over', 'asset.booking.reminded', 'asset.booking.overdue']));
    expect((await api('it', 'get', '/lifecycle/asset-bookings').expect(200)).body.rows.find((r: { id: string }) => r.id === s1.ids[0])).toMatchObject({ status: 'out', overdue: true, person: `Sita ${run}` });
    // Take back (the register's return) records the return and ends the booking.
    await api('it', 'post', `/lifecycle/assets/${pj}/return`).send({ returnedOn: today, condition: 'Fine', status: 'in_stock' }).expect(200);
    expect(await inA((tx) => tx.assetBooking.findFirstOrThrow({ where: { id: s1.ids[0] } }))).toMatchObject({ status: 'returned', assignmentId: ho.assignmentId });
    expect((await inA((tx) => tx.assetAssignment.findFirstOrThrow({ where: { id: ho.assignmentId } }))).returnedOn).not.toBeNull();
    // The person cancels the later ones of their repeat; IT cancels only with a reason (the person is told).
    expect((await api('mgr', 'post', `/lifecycle/me/asset-bookings/${w.ids[1]}/cancel`).send({ series: true }).expect(200)).body.cancelled).toBe(2);
    await api('it', 'post', `/lifecycle/asset-bookings/${w.ids[0]}/cancel`).send({}).expect(400);
    await api('it', 'post', `/lifecycle/asset-bookings/${w.ids[0]}/cancel`).send({ reason: 'Projector needed for the town hall' }).expect(200);
    expect(await inA((tx) => tx.userNotification.count({ where: { type: 'asset.booking.cancelled', entityId: w.ids[0], recipientUserId: users.mgr } }))).toBe(1);
    await api('it', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: false }).expect(200);
    await api('it', 'put', `/lifecycle/assets/${pj}/bookable`).send({ bookable: true }).expect(200);
    ids.projector = pj;
  });

  it('IT assets part 5 (2715): with the approval setting a booking waits for IT, who approves or declines with a reason; both told', async () => {
    const o = { organizationId: org.A.id };
    const pj = ids.projector;
    const s = await inA((tx) => tx.setting.create({ data: { ...o, scopeType: 'tenant', scopeId: org.A.id, key: 'asset.booking_approval', value: 'on' } }));
    try {
      const book = (startsOn: string) => api('sita', 'post', '/lifecycle/me/asset-bookings').send({ assetId: pj, startsOn, endsOn: startsOn, repeat: 'none' });
      const b1 = (await book(addDays(today, 30)).expect(201)).body;
      expect(b1.status).toBe('pending');
      expect((await inA((tx) => tx.userNotification.findMany({ where: { type: 'asset.booking.requested', entityId: b1.ids[0] } }))).map((n) => n.recipientUserId)).toEqual(expect.arrayContaining([users.it]));
      // A pending booking blocks the day, is not handed over, and is decided only by asset managers with a reason to decline.
      await book(addDays(today, 30)).expect(409);
      await api('it', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/hand-over`).send({ condition: 'Good' }).expect(409);
      await api('sita', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/approve`).expect(403);
      await api('agent', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/approve`).expect(403);
      await api('adminB', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/approve`).expect(404);
      await api('it', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/decline`).send({}).expect(400);
      await api('it', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/decline`).send({ reason: 'Out for repair that week' }).expect(200);
      const decided = (id: string) => inA((tx) => tx.userNotification.findMany({ where: { type: 'asset.booking.decided', entityId: id }, select: { recipientUserId: true, contextText: true } }));
      expect(await decided(b1.ids[0])).toEqual([expect.objectContaining({ recipientUserId: users.sita, contextText: expect.stringContaining('declined: Out for repair that week') })]);
      await api('it', 'post', `/lifecycle/asset-bookings/${b1.ids[0]}/approve`).expect(409);
      // Declined frees the day; the next one is approved.
      const b2 = (await book(addDays(today, 30)).expect(201)).body;
      await api('it', 'post', `/lifecycle/asset-bookings/${b2.ids[0]}/approve`).expect(200);
      expect(await inA((tx) => tx.assetBooking.findFirstOrThrow({ where: { id: b2.ids[0] } }))).toMatchObject({ status: 'booked', decidedBy: users.it });
      expect(await decided(b2.ids[0])).toEqual([expect.objectContaining({ recipientUserId: users.sita, contextText: expect.stringContaining('is approved') })]);
      expect((await inA((tx) => tx.auditLog.findMany({ where: { entityType: 'asset_booking', entityId: { in: [b1.ids[0], b2.ids[0]] } } }))).map((a) => a.action)).toEqual(expect.arrayContaining(['asset.booking.declined', 'asset.booking.approved']));
      // The person cancels their own booking to come.
      expect((await api('sita', 'post', `/lifecycle/me/asset-bookings/${b2.ids[0]}/cancel`).send({}).expect(200)).body.cancelled).toBe(1);
    } finally {
      await inA((tx) => tx.setting.update({ where: { id: s.id }, data: { value: 'off' } }));
    }
  });

  it('two companies apart', async () => {
    await api('adminB', 'get', `/lifecycle/exits/${ids.raviCase}`).expect(404);
    expect((await api('adminB', 'get', '/lifecycle/exits').expect(200)).body.rows).toHaveLength(0);
    expect((await api('hr', 'get', '/lifecycle/exits').expect(200)).body.rows.find((r: { id: string }) => r.id === ids.raviCase)).toMatchObject({ manager: `Divya ${run}` });
    expect((await api('sita', 'get', '/lifecycle/exits').expect(200)).body.rows).toEqual([]); // a colleague without the key: no one else's case
    expect((await api('adminB', 'get', '/lifecycle/assets').expect(200)).body.rows).toHaveLength(0);
    await api('adminB', 'post', `/lifecycle/assets/${ids.laptop}/issue`).send({ employeeId: emp.ravi, issuedOn: today, condition: 'Fine' }).expect(404);
    expect(await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.exitCase.count())).toBe(0);
    await automation.dispatch().catch(() => undefined);
  });
});
