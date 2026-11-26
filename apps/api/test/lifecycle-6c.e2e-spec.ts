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
import { addMonthsIso } from '../src/lifecycle/asset-categories';

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
