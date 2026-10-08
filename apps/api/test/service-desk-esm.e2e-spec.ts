process.env.SD_SCANNER = 'dev-fake';
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
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import { createFakeBlobStorage } from './fixtures/fake-blob-storage';
import { markSteppedUp } from './fixtures/step-up';

// M14 Service Desk phase 3b-2 batch 1 (SD-2.01 … SD-2.05, SD-2.12) and the shared P19 / P03 engines, end to end
// against the real database (forced RLS, the visibility policies, the app role) and Redis: the catalogue with forms,
// audiences and pinned versions; the cart; approvals with quorum, reminders, timeouts, delegation and no self-approval;
// fulfilment tasks for two teams that only their holders complete; cancel; ad-hoc approvals; automation rules with the
// trace, loop protection and limits; webhooks behind the SSRF guard; two companies kept apart.
describe('Service Desk 3b-2 batch 1: catalogue, approvals, automation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  let engine: ApprovalsEngine;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  type Who = 'adminA' | 'adminB' | 'agent' | 'lead' | 'deskAdmin' | 'boss' | 'mgr' | 'emp' | 'cco' | 'other' | 'empB';
  const users = {} as Record<Who, string>;
  const token = {} as Record<Who, string>;
  const ids: Record<string, string> = {};
  const api = (who: Who, method: 'get' | 'post' | 'patch', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctxA = () => ({ organizationId: org.A.id, isSuperAdmin: false });
  const system = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>, o = org.A.id) =>
    tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.sd_system', 'on', true)`;
      return fn(tx);
    });
  const today = new Date().toISOString().slice(0, 10);
  const inbox = async (who: Who) => (await api(who, 'get', '/workflow/approvals/inbox').expect(200)).body as { taskId: string; title: string; summary: { label: string; value: string }[]; onBehalfOf: string | null }[];
  const decide = (who: Who, taskId: string, decision: 'approve' | 'reject', reason?: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision, ...(reason ? { reason } : {}) });
  /** Events are handled by the outbox dispatcher (this process or another API on the same database): wait for the run. */
  const runsOf = async (ruleId: string, until: (rows: { outcome: string; recordId: string }[]) => boolean) => {
    for (let i = 0; i < 40; i++) {
      await automation.dispatch();
      const rows = await system((tx) => tx.automationRun.findMany({ where: { ruleId }, orderBy: { at: 'asc' } }));
      if (until(rows)) return rows;
      await new Promise((r) => setTimeout(r, 500));
    }
    return system((tx) => tx.automationRun.findMany({ where: { ruleId }, orderBy: { at: 'asc' } }));
  };

  const LAPTOP_FORM = {
    sections: [
      {
        id: 's1',
        title: 'Your laptop',
        columns: 2,
        fields: [
          { key: 'model', type: 'choice', label: 'Model', required: true, options: [{ value: 'std', label: 'Standard' }, { value: 'dev', label: 'Developer', colour: 'purple' }] },
          { key: 'reason', type: 'textarea', label: 'Why the developer model?' },
          { key: 'cc', type: 'cost_centre', label: 'Cost centre', required: true },
          { key: 'budget_code', type: 'text', label: 'Budget code', sensitive: true },
        ],
      },
    ],
    rules: [{ id: 'r1', when: { id: 'w', join: 'and', items: [{ id: 'c', field: 'model', operator: 'is', value: 'dev' }] }, then: [{ action: 'show', field: 'reason' }, { action: 'require', field: 'reason' }] }],
  };

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
    automation = moduleRef.get(AutomationService);
    engine = moduleRef.get(ApprovalsEngine);

    planId = (await prisma.plan.create({ data: { name: `esm-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `ESM Org ${k}`, slug: `esm-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const profile = async (o: string, key: string) =>
      (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: o, name: `${key}-${run}-${randomUUID().slice(0, 4)}`, permissionsJson: JSON.stringify(ROLE_TEMPLATES.find((t) => t.key === key)!.permissions) } }))).id;
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string, string | null][] = [
      ['adminA', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', null],
      ['agent', 'A', 'panel', 'desk_agent'],
      ['lead', 'A', 'panel', 'desk_lead'],
      ['deskAdmin', 'A', 'panel', 'desk_admin'],
      ['boss', 'A', 'panel', null],
      ['mgr', 'A', 'panel', null],
      ['emp', 'A', 'panel', null],
      ['cco', 'A', 'panel', null],
      ['other', 'A', 'panel', null],
      ['empB', 'B', 'panel', null],
    ];
    for (const [who, k, role, tpl] of roster) {
      const o = org[k].id;
      const permissionProfileId = tpl ? await profile(o, tpl) : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: o, isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: o, email: `${who}@esm-${run}.test`, name: `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${who}@esm-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // Company A's structure: one entity, two departments, a cost centre owned by cco.
    await tenantPrisma.forTenant(ctxA(), async (tx) => {
      const o = { organizationId: org.A.id };
      ids.entity = (await tx.legalEntity.create({ data: { ...o, name: 'ESM Foods', shortName: `ESM-${run}`, isDefault: true } })).id;
      ids.blr = (await tx.location.create({ data: { ...o, legalEntityId: ids.entity, name: 'Bengaluru', code: 'BLR', address: {}, country: 'IN', state: 'IN-KA', timezone: 'Asia/Kolkata' } })).id;
      for (const code of ['ENG', 'OPS']) {
        const id = randomUUID();
        ids[`dept${code}`] = (await tx.department.create({ data: { ...o, id, name: code, code, path: `/${id}/` } })).id;
      }
      ids.desig = (await tx.designation.create({ data: { ...o, name: 'Engineer', code: 'ENGR' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...o, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      ids.cc = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.entity, name: 'Engineering', code: 'CC-ENG', ownerUserId: users.cco } })).id;
      ids.ccNoOwner = (await tx.costCentre.create({ data: { ...o, legalEntityId: ids.entity, name: 'Spare', code: 'CC-SPR' } })).id;
    });
    const hire = async (who: Who, manager: string | null, dept = ids.deptENG) =>
      (
        await api('adminA', 'post', '/people/employees')
          .send({ legalEntityId: ids.entity, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@esm-${run}.test`, assignment: { locationId: ids.blr, departmentId: dept, designationId: ids.desig, employmentTypeId: ids.perm, managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.bossEmp = await hire('boss', null);
    ids.mgrEmp = await hire('mgr', ids.bossEmp);
    ids.empEmp = await hire('emp', ids.mgrEmp);
    ids.otherEmp = await hire('other', ids.mgrEmp, ids.deptOPS);
    ids.ccoEmp = await hire('cco', ids.bossEmp);

    ids.it = (await api('adminA', 'post', '/desk/desks').send({ name: 'IT help', key: 'IT', kind: 'it' }).expect(201)).body.id;
    ids.itB = (await api('adminB', 'post', '/desk/desks').send({ name: 'B IT', key: 'BIT', kind: 'it' }).expect(201)).body.id;
    for (const [who, role] of [['agent', 'agent'], ['lead', 'lead'], ['deskAdmin', 'admin']] as const) await api('adminA', 'post', `/desk/desks/${ids.it}/members`).send({ userId: users[who], role }).expect(201);
    await system(async (tx) => {
      const g = await tx.sdGroup.findFirstOrThrow({ where: { deskId: ids.it } });
      ids.itTeam = g.id;
      await tx.sdGroupMember.create({ data: { organizationId: org.A.id, deskId: ids.it, groupId: g.id, userId: users.agent } });
      ids.adminTeam = (await tx.sdGroup.create({ data: { organizationId: org.A.id, deskId: ids.it, name: 'Admin team' } })).id;
      await tx.sdGroupMember.create({ data: { organizationId: org.A.id, deskId: ids.it, groupId: ids.adminTeam, userId: users.lead } });
      ids.catLaptop = (await tx.sdCategory.findFirstOrThrow({ where: { deskId: ids.it, name: 'Laptop and devices' } })).id;
    });
  }, 180_000);

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

  it('every new table has forced RLS and the tenant policy', async () => {
    const tables = ['rules', 'rule_versions', 'automation_runs', 'automation_webhooks', 'wf_requests', 'wf_tasks', 'wf_actions', 'wf_delegations', 'sd_questionnaires', 'sd_catalog_items', 'sd_catalog_item_versions', 'sd_order_guides', 'sd_request_items'];
    const rows = await prisma.$queryRaw<{ relname: string; forced: boolean; policy: boolean }[]>`
      SELECT c.relname, c.relforcerowsecurity AS forced, EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname AND p.policyname = 'tenant_isolation') AS policy
      FROM pg_class c WHERE c.relname = ANY(${tables}::text[])`;
    expect(rows).toHaveLength(tables.length);
    for (const r of rows) expect(r).toMatchObject({ forced: true, policy: true });
  });

  // ------------------------------------------------------------------------------------------ catalogue (SD-2.01, SD-2.03)

  describe('catalogue', () => {
    it('only a desk admin with the key builds items; the engines check forms, approvers and plans', async () => {
      await api('agent', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'X' }).expect(403);
      await api('adminB', 'get', `/desk/catalog/admin/items?deskId=${ids.it}`).expect(404);
      const draft = {
        bodyHtml: '<p>A new laptop.</p><script>alert(1)</script>',
        form: LAPTOP_FORM,
        approval: [
          { name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', remindAfterHours: 1, timeoutHours: 2, onTimeout: 'escalate' },
          { name: 'Cost-centre owner', approvers: [{ kind: 'cost_centre_owner', field: 'cc' }], mode: 'any' },
        ],
        fulfilment: [
          { title: 'Set up the laptop', groupId: ids.itTeam, olaHours: 16 },
          { title: 'Deliver it', groupId: ids.adminTeam, olaHours: 24 },
        ],
      };
      // A formula is data: a script is refused; so is a cost-centre owner read from a text answer.
      await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Bad', draft: { form: { sections: [{ id: 's', columns: 1, fields: [{ key: 'f', type: 'formula', label: 'F', formula: 'require("fs")' }] }] } } }).expect(400);
      await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Bad', draft: { ...draft, approval: [{ name: 'CC', approvers: [{ kind: 'cost_centre_owner', field: 'reason' }], mode: 'any' }] } }).expect(400);
      await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Bad', draft: { ...draft, fulfilment: [{ title: 'X', groupId: randomUUID() }] } }).expect(400);
      const item = (await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'New laptop', categoryId: ids.catLaptop, cost: 85000, deliveryDays: 5, draft }).expect(201)).body;
      expect(item.draft.bodyHtml).not.toContain('script');
      ids.laptop = item.id;
      const pub = (await api('deskAdmin', 'post', `/desk/catalog/admin/items/${item.id}/publish`).send({ version: item.version }).expect(200)).body;
      expect(pub).toMatchObject({ state: 'published', currentVersion: 1 });
      // An item only the OPS department sees.
      const ops = (await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Forklift badge', audience: { id: 'a', join: 'and', items: [{ id: 'c', field: 'requester.department', operator: 'is', value: ids.deptOPS }] }, draft: { fulfilment: [{ title: 'Print the badge', groupId: ids.itTeam }] } }).expect(201)).body;
      await api('deskAdmin', 'post', `/desk/catalog/admin/items/${ops.id}/publish`).send({ version: ops.version }).expect(200);
      ids.ops = ops.id;
    });

    it('requesters see only the items their profile matches; the item page carries the form', async () => {
      const emp = (await api('emp', 'get', '/desk/my/catalog').expect(200)).body;
      expect(emp.items.map((i: { name: string }) => i.name)).toEqual(['New laptop']);
      await api('emp', 'get', `/desk/my/catalog/items/${ids.ops}`).expect(404);
      expect((await api('other', 'get', '/desk/my/catalog').expect(200)).body.items.map((i: { name: string }) => i.name).sort()).toEqual(['Forklift badge', 'New laptop']);
      const page = (await api('emp', 'get', `/desk/my/catalog/items/${ids.laptop}`).expect(200)).body;
      expect(page).toMatchObject({ name: 'New laptop', version: 1, approvals: ['Manager', 'Cost-centre owner'] });
      // Company B sees nothing of company A.
      expect((await api('empB', 'get', '/desk/my/catalog').expect(200)).body.items).toEqual([]);
      await api('empB', 'get', `/desk/my/catalog/items/${ids.laptop}`).expect(404);
    });

    it('live-data pickers answer from the company only', async () => {
      const cc = (await api('emp', 'get', '/desk/my/pick/cost-centres?q=eng').expect(200)).body;
      expect(cc).toEqual([{ id: ids.cc, label: 'Engineering', detail: 'CC-ENG' }]);
      expect((await api('empB', 'get', '/desk/my/pick/cost-centres?q=eng').expect(200)).body).toEqual([]);
      expect((await api('emp', 'get', `/desk/my/pick/people?q=${encodeURIComponent('mgr')}`).expect(200)).body[0]).toMatchObject({ label: `mgr ${run}` });
      await api('emp', 'get', '/desk/my/pick/salaries').expect(400);
    });
  });

  // ------------------------------------------------------------------------------------------ order → approvals → tasks (SD-2.04, SD-2.05)

  describe('ordering and approvals', () => {
    it('checks the answers by form rules before anything is made', async () => {
      const bad = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'dev', cc: ids.cc } }] }).expect(400)).body;
      expect(bad.errors['0']).toEqual({ reason: 'Answer this question.' });
      await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'std', cc: randomUUID() } }] }).expect(400);
      await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.ops, answers: {} }] }).expect(404);
    });

    it('manager then cost-centre owner; approvers see only the summary; nobody else decides; a reject needs a reason', async () => {
      const out = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'dev', reason: 'I build apps', cc: ids.cc, budget_code: 'SECRET-77' } }] }).expect(201)).body;
      ids.order1 = out.requests[0].ticketId;
      const mine = await inbox('mgr');
      expect(mine).toHaveLength(1);
      expect(mine[0].title).toBe(`New laptop for emp ${run}`);
      expect(JSON.stringify(mine[0].summary)).toContain('Engineering');
      expect(JSON.stringify(mine[0].summary)).not.toContain('SECRET-77');
      expect(await inbox('emp')).toEqual([]);
      await decide('emp', mine[0].taskId, 'approve').expect(404);
      await decide('cco', mine[0].taskId, 'approve').expect(404);
      await decide('mgr', mine[0].taskId, 'approve').expect(200);
      await decide('mgr', mine[0].taskId, 'approve').expect(409);
      const cco = await inbox('cco');
      expect(cco).toHaveLength(1);
      await decide('cco', cco[0].taskId, 'reject').expect(400);
      await decide('cco', cco[0].taskId, 'approve').expect(200);
      const req = (await api('emp', 'get', `/desk/my/requests/${ids.order1}`).expect(200)).body;
      expect(req.items[0]).toMatchObject({ stage: 'fulfilment', canCancel: false });
      expect(req.items[0].tracker.map((x: { state: string }) => x.state)).toEqual(['done', 'done', 'current', 'next']);
      // The requester's view leaves the sensitive answer out.
      expect(JSON.stringify(req.items[0].answers)).not.toContain('SECRET-77');
      expect(req.items[0].tasks.map((k: { title: string }) => k.title)).toEqual(['Set up the laptop', 'Deliver it']);
    });

    it('only the team a task is given to completes it; the last task delivers the item and resolves the request', async () => {
      const tasks = await system((tx) => tx.sdTask.findMany({ where: { ticketId: ids.order1 }, orderBy: { sortOrder: 'asc' } }));
      expect(tasks.map((k) => k.groupId)).toEqual([ids.itTeam, ids.adminTeam]);
      expect(tasks[0].dueAt!.getTime() - Date.now()).toBeGreaterThan(15 * 3_600_000);
      // The agent sees the Admin team's task but cannot complete it (US-G-054).
      await api('agent', 'patch', `/desk/tasks/${tasks[1].id}`).send({ version: tasks[1].version, state: 'done' }).expect(403);
      await api('lead', 'patch', `/desk/tasks/${tasks[1].id}`).send({ version: tasks[1].version, state: 'done' }).expect(200);
      await api('agent', 'patch', `/desk/tasks/${tasks[0].id}`).send({ version: tasks[0].version, state: 'done' }).expect(200);
      const req = (await api('emp', 'get', `/desk/my/requests/${ids.order1}`).expect(200)).body;
      expect(req.items[0].stage).toBe('delivered');
      expect(req.systemState).toBe('solved');
    });

    it('orders pin the version they were made from', async () => {
      const item = (await api('deskAdmin', 'get', `/desk/catalog/admin/items/${ids.laptop}`).expect(200)).body;
      const form = { ...LAPTOP_FORM, sections: [{ ...LAPTOP_FORM.sections[0], fields: [...LAPTOP_FORM.sections[0].fields, { key: 'bag', type: 'checkbox', label: 'Add a bag' }] }] };
      const upd = (await api('deskAdmin', 'patch', `/desk/catalog/admin/items/${ids.laptop}`).send({ version: item.version, draft: { ...item.draft, form } }).expect(200)).body;
      await api('deskAdmin', 'post', `/desk/catalog/admin/items/${ids.laptop}/publish`).send({ version: upd.version }).expect(200);
      const items = await system((tx) => tx.sdRequestItem.findMany({ where: { ticketId: ids.order1 } }));
      expect(items[0].itemVersion).toBe(1);
      const out = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'std', cc: ids.cc, bag: true } }] }).expect(201)).body;
      ids.order2 = out.requests[0].ticketId;
      expect((await system((tx) => tx.sdRequestItem.findFirstOrThrow({ where: { ticketId: ids.order2 } }))).itemVersion).toBe(2);
    });

    it('cancel before fulfilment withdraws the approval; after it starts, cancel is refused', async () => {
      expect((await inbox('mgr')).length).toBe(1);
      await api('other', 'post', `/desk/my/requests/${ids.order2}/cancel`).send({}).expect(404);
      expect((await api('emp', 'post', `/desk/my/requests/${ids.order2}/cancel`).send({ reason: 'Found a spare one' }).expect(200)).body).toEqual({ cancelled: 1 });
      expect(await inbox('mgr')).toEqual([]);
      const req = (await api('emp', 'get', `/desk/my/requests/${ids.order2}`).expect(200)).body;
      expect(req.items[0].stage).toBe('cancelled');
      expect(req.systemState).toBe('closed');
      await api('emp', 'post', `/desk/my/requests/${ids.order1}/cancel`).send({}).expect(409);
    });

    it('a requester never approves their own request; a step may allow it, and then it is logged as self-approval', async () => {
      const mk = async (name: string, selfApproval: 'never' | 'allowed') => {
        const it = (await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name, draft: { approval: [{ name: 'Named', approvers: [{ kind: 'users', userIds: [users.emp] }], mode: 'any', selfApproval }], fulfilment: [] } }).expect(201)).body;
        await api('deskAdmin', 'post', `/desk/catalog/admin/items/${it.id}/publish`).send({ version: it.version }).expect(200);
        return it.id as string;
      };
      const never = await mk('Self never', 'never');
      await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: never, answers: {} }] }).expect(201);
      // emp is taken out of the step; the desk's leads approve instead (fallback).
      expect(await inbox('emp')).toEqual([]);
      const lead = (await inbox('lead')).find((t) => t.title.startsWith('Self never'))!;
      expect(lead).toBeDefined();
      const allowed = await mk('Self allowed', 'allowed');
      await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: allowed, answers: {} }] }).expect(201);
      const own = (await inbox('emp')).find((t) => t.title.startsWith('Self allowed'))!;
      await decide('emp', own.taskId, 'approve').expect(200);
      const action = await system((tx) => tx.wfAction.findFirstOrThrow({ where: { actorUserId: users.emp, action: { in: ['approved', 'self_approved'] } } }));
      expect(action.action).toBe('self_approved');
      expect(await system((tx) => tx.auditLog.count({ where: { action: 'workflow.request.self_approved', actorUserId: users.emp } }))).toBe(1);
    });

    it('reminders, then escalation to the approver\'s manager when time runs out', async () => {
      const out = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'std', cc: ids.cc } }] }).expect(201)).body;
      ids.order3 = out.requests[0].ticketId;
      const t = (await inbox('mgr')).find((x) => x.title.startsWith('New laptop'))!;
      await engine.tick(new Date(Date.now() + 90 * 60_000));
      expect(await system((tx) => tx.wfAction.count({ where: { taskId: t.taskId, action: 'reminded' } }))).toBe(1);
      await engine.tick(new Date(Date.now() + 3 * 3_600_000));
      // The boss now holds the step too; either answer counts.
      const boss = (await inbox('boss')).find((x) => x.title.startsWith('New laptop'))!;
      expect(boss).toBeDefined();
      await decide('boss', boss.taskId, 'approve').expect(200);
      expect((await inbox('mgr')).find((x) => x.taskId === t.taskId)).toBeUndefined();
      expect((await inbox('cco')).some((x) => x.title.startsWith('New laptop'))).toBe(true);
    });

    it('auto-approve after a timeout only where the item allows it (never on high-risk ad-hoc approvals)', async () => {
      const it = (await api('deskAdmin', 'post', '/desk/catalog/admin/items').send({ deskId: ids.it, name: 'Mouse', draft: { approval: [{ name: 'Manager', approvers: [{ kind: 'manager' }], mode: 'any', timeoutHours: 1, onTimeout: 'approve' }], fulfilment: [{ title: 'Hand over a mouse', groupId: ids.itTeam }] } }).expect(201)).body;
      await api('deskAdmin', 'post', `/desk/catalog/admin/items/${it.id}/publish`).send({ version: it.version }).expect(200);
      const out = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: it.id, answers: {} }] }).expect(201)).body;
      await engine.tick(new Date(Date.now() + 2 * 3_600_000));
      const req = (await api('emp', 'get', `/desk/my/requests/${out.requests[0].ticketId}`).expect(200)).body;
      expect(req.items[0].stage).toBe('fulfilment');
      expect(req.items[0].approval.log.map((l: { action: string }) => l.action)).toContain('auto_approved');
    });

    it('delegation: by hand (open tasks move, "on behalf of" is kept) and from leave (to the manager)', async () => {
      const out = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'std', cc: ids.cc } }] }).expect(201)).body;
      await api('mgr', 'post', '/workflow/delegations').send({ delegateUserId: users.mgr, startsOn: today, endsOn: today }).expect(400);
      await api('mgr', 'post', '/workflow/delegations').send({ delegateUserId: users.other, startsOn: today, endsOn: today }).expect(201);
      const t = (await inbox('other')).find((x) => x.title.startsWith('New laptop'))!;
      expect(t.onBehalfOf).toBe(`mgr ${run}`);
      await decide('other', t.taskId, 'approve').expect(200);
      const log = (await api('emp', 'get', `/desk/my/requests/${out.requests[0].ticketId}`).expect(200)).body.items[0].approval.log;
      expect(log[0]).toMatchObject({ action: 'approved', by: `other ${run}`, onBehalfOf: `mgr ${run}` });
      // The leave seam: with no delegate chosen, the approver's own manager holds their tasks.
      const res = await tenantPrisma.forTenant(ctxA(), (tx) => engine.delegateForLeave(tx, ctxA(), users.cco, today, today));
      expect(res?.moved).toBeGreaterThan(0);
      expect((await inbox('boss')).some((x) => x.onBehalfOf === `cco ${run}`)).toBe(true);
    });

    it('ad-hoc approval on a ticket: all three must approve; the answer lands on the ticket', async () => {
      await api('emp', 'post', `/desk/tickets/${ids.order1}/approvals`).send({ userIds: [users.mgr], question: 'OK?' }).expect(403);
      const r = (await api('agent', 'post', `/desk/tickets/${ids.order1}/approvals`).send({ userIds: [users.mgr, users.other, users.boss], mode: 'all', question: 'Replace the old laptop too?' }).expect(201)).body;
      for (const who of ['mgr', 'other'] as const) {
        const t = (await inbox(who)).find((x) => x.title.includes('Replace the old laptop'))!;
        await decide(who, t.taskId, 'approve').expect(200);
      }
      expect((await system((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: r.requestId } }))).status).toBe('pending');
      const last = (await inbox('boss')).find((x) => x.title.includes('Replace the old laptop'))!;
      await decide('boss', last.taskId, 'approve').expect(200);
      const view = (await api('agent', 'get', `/desk/tickets/${ids.order1}/request`).expect(200)).body;
      expect(view.approvals[0]).toMatchObject({ status: 'approved' });
      expect(await system((tx) => tx.sdTicketEvent.count({ where: { ticketId: ids.order1, kind: 'approval_decided' } }))).toBe(1);
    });

    it('company B cannot reach company A\'s approvals, even with the task id', async () => {
      const out = (await api('emp', 'post', '/desk/my/catalog/checkout').send({ items: [{ itemId: ids.laptop, answers: { model: 'std', cc: ids.cc } }] }).expect(201)).body;
      const t = (await inbox('boss')).concat(await inbox('mgr')).find((x) => x.title.startsWith('New laptop'))!;
      await decide('empB', t.taskId, 'approve').expect(404);
      await api('empB', 'get', `/workflow/approvals/requests/${(await system((tx) => tx.sdRequestItem.findFirstOrThrow({ where: { ticketId: out.requests[0].ticketId } }))).approvalRequestId}`).expect(404);
      const seen = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.wfTask.count({ where: { id: t.taskId } }));
      expect(seen).toBe(0);
    });
  });

  // ------------------------------------------------------------------------------------------ automation (SD-2.12)

  describe('automation rules', () => {
    it('needs the rule key and the desk admin role; actions are checked against the desk', async () => {
      await api('agent', 'get', `/desk/rules?deskId=${ids.it}`).expect(403);
      await api('adminB', 'get', `/desk/rules?deskId=${ids.it}`).expect(404);
      const bad = { deskId: ids.it, name: 'X', trigger: { type: 'created' }, actions: [{ type: 'assign', groupId: randomUUID() }] };
      await api('deskAdmin', 'post', '/desk/rules').send(bad).expect(400);
      await api('deskAdmin', 'post', '/desk/rules').send({ ...bad, condition: { id: 'g', join: 'and', items: [{ id: 'c', field: 'constructor', operator: 'is', value: 'x' }] }, actions: [{ type: 'add_tag', tag: 'x' }] }).expect(400);
    });

    it('a rule runs on new tickets, changes them and leaves a trace', async () => {
      const rule = (await api('deskAdmin', 'post', '/desk/rules').send({ deskId: ids.it, name: 'Printers', trigger: { type: 'created' }, condition: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'subject', operator: 'contains', value: 'printer' }] }, actions: [{ type: 'add_tag', tag: 'printer' }, { type: 'assign', groupId: ids.adminTeam }] }).expect(201)).body;
      await api('deskAdmin', 'post', `/desk/rules/${rule.id}/status`).send({ version: rule.version, status: 'active' }).expect(200);
      const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `The printer jams ${run}`, description: 'Paper everywhere.' }).expect(201)).body;
      const runs = await runsOf(rule.id, (r) => r.some((x) => x.outcome === 'matched'));
      expect(runs.find((x) => x.outcome === 'matched')).toMatchObject({ recordId: t.id, trigger: 'created' });
      const ticket = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }));
      expect(ticket.tags).toContain('printer');
      expect(ticket.groupId).toBe(ids.adminTeam);
      const trace = (await api('deskAdmin', 'get', `/desk/rules/${rule.id}/runs`).expect(200)).body;
      expect(trace[0].trace[0]).toMatchObject({ field: 'subject', pass: true });
      // Dry run: which recent tickets it would change, changing nothing.
      const dry = (await api('deskAdmin', 'post', `/desk/rules/${rule.id}/dry-run`).expect(200)).body;
      expect(dry.matched).toBeGreaterThanOrEqual(1);
      await api('deskAdmin', 'post', `/desk/rules/${rule.id}/status`).send({ version: rule.version + 1, status: 'paused' }).expect(200);
    });

    it('loop protection: a rule that re-triggers itself stops after one pass', async () => {
      const rule = (await api('deskAdmin', 'post', '/desk/rules').send({ deskId: ids.it, name: 'Ping', trigger: { type: 'updated', fields: ['tags'] }, actions: [{ type: 'add_tag', tag: `again-${Date.now() % 1000}` }, { type: 'set_field', field: 'priority', value: 2 }] }).expect(201)).body;
      await api('deskAdmin', 'post', `/desk/rules/${rule.id}/status`).send({ version: rule.version, status: 'active' }).expect(200);
      const t = (await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `Loop ${run}`, description: 'Loop test.' }).expect(201)).body;
      const tk = await system((tx) => tx.sdTicket.findFirstOrThrow({ where: { id: t.id } }));
      await api('agent', 'patch', `/desk/tickets/${t.id}`).send({ version: tk.version, tags: ['first'] }).expect(200);
      // Only this ticket's runs (events of earlier tests may still arrive while the rule is on).
      const runs = (await runsOf(rule.id, (r) => r.some((x) => x.outcome === 'loop_stopped' && x.recordId === t.id))).filter((x) => x.recordId === t.id);
      expect(runs.filter((x) => x.outcome === 'matched')).toHaveLength(1);
      expect(runs.find((x) => x.outcome === 'loop_stopped')).toMatchObject({ depth: 1, error: expect.stringMatching(/already ran in this chain/) });
      await api('deskAdmin', 'post', `/desk/rules/${rule.id}/status`).send({ version: rule.version + 1, status: 'retired' }).expect(200);
    });

    it('a rule over its hourly limit pauses itself', async () => {
      const rule = (await api('deskAdmin', 'post', '/desk/rules').send({ deskId: ids.it, name: 'Limited', maxRunsPerHour: 1, trigger: { type: 'created' }, condition: { id: 'g', join: 'and', items: [{ id: 'c1', field: 'subject', operator: 'contains', value: 'limit-me' }] }, actions: [{ type: 'add_tag', tag: 'limited' }] }).expect(201)).body;
      await api('deskAdmin', 'post', `/desk/rules/${rule.id}/status`).send({ version: rule.version, status: 'active' }).expect(200);
      for (const n of [1, 2]) await api('emp', 'post', '/desk/my/tickets').send({ deskId: ids.it, subject: `limit-me ${n} ${run}`, description: 'x' }).expect(201);
      const runs = await runsOf(rule.id, (r) => r.some((x) => x.outcome === 'limit_stopped'));
      expect(runs.map((x) => x.outcome).filter((o) => o !== 'not_matched')).toEqual(['matched', 'limit_stopped']);
      expect((await system((tx) => tx.rule.findFirstOrThrow({ where: { id: rule.id } }))).status).toBe('paused');
    });

    it('recipes install as drafts filled in with the desk', async () => {
      const r = (await api('deskAdmin', 'post', '/desk/recipes/urgent_tell_leads/install').send({ deskId: ids.it }).expect(201)).body;
      expect(r).toMatchObject({ status: 'draft', recipeKey: 'urgent_tell_leads' });
      await api('deskAdmin', 'post', '/desk/recipes/nope/install').send({ deskId: ids.it }).expect(404);
    });

    it('webhooks: public https only (the SSRF guard), a fresh second factor, and the integrations key to use one', async () => {
      await api('adminA', 'post', '/desk/automation-webhooks').send({ name: 'Ops', url: 'https://example.com/hook' }).expect(403);
      await markSteppedUp(tenantPrisma, token.adminA);
      for (const url of ['http://example.com/hook', 'https://127.0.0.1/hook', 'https://localhost/hook', 'https://[::1]/hook', 'https://10.0.0.5/x', 'https://user:pw@example.com/x', 'https://169.254.169.254/latest']) {
        await api('adminA', 'post', '/desk/automation-webhooks').send({ name: 'Bad', url }).expect(400);
      }
      await api('deskAdmin', 'get', '/desk/automation-webhooks').expect(403);
      // A desk admin without the integrations key cannot put a webhook into a rule.
      await api('deskAdmin', 'post', '/desk/rules').send({ deskId: ids.it, name: 'Hook', trigger: { type: 'created' }, actions: [{ type: 'webhook', webhookId: randomUUID() }] }).expect(400);
    });
  });
});
