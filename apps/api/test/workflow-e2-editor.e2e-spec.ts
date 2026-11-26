import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { ApprovalsEngine, type StepSpec, type SubmitInput } from '../src/workflow/approvals-engine.service';

// E2 parts 4 to 7 against the real database (forced RLS): the widened type list (pay types locked or add-on only, hiring
// fully editable), rules with conditions and an otherwise route, the save refusals, the approval limits, "Try it" on the
// engine's own route(), the hiring chain dry run and move, and the hiring notices.
describe('E2: approval rules editor', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let engine: ApprovalsEngine;
  const sent: { to: string; subject: string; html: string }[] = [];
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const org = { id: '', slug: '' };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const ctx = () => ({ organizationId: org.id, isSuperAdmin: false, userId: null });
  const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(ctx(), fn);
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const version = async (type: string) => ((await api('hr', 'get', '/workflow/policies').expect(200)).body.types as { key: string; version: number }[]).find((t) => t.key === type)!.version;
  const when = (field: string, operator: string, value: unknown) => ({ id: 'g1', join: 'and', items: [{ id: 'c1', field, operator, value }] });
  const HR = { name: 'HR look', approver: 'hr', mode: 'any' };
  const input = (type: string, payload: Record<string, unknown>, steps: StepSpec[] = [], requester = 'emp'): SubmitInput => ({ type, subjectType: 'test', subjectId: randomUUID(), title: `E2 editor ${run}`, summary: [{ label: 'Secret', value: 'pay 99,00,000' }], subjectPersonId: null, requesterUserId: users[requester]!, raisedByUserId: users[requester]!, steps, payload: payload as SubmitInput['payload'], payloadFields: [], fallbackUserIds: [users.admin!], alwaysRoute: true });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EmailService)
      .useValue({ send: jest.fn(async (m: { to: string; subject: string; html: string }) => (sent.push(m), { success: true })) })
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    engine = moduleRef.get(ApprovalsEngine);

    ids.plan = (await prisma.plan.create({ data: { name: `e2e-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const o = await prisma.organization.create({ data: { name: `E2 editor ${run}`, slug: `e2e-${run}`, planId: ids.plan } });
    Object.assign(org, { id: o.id, slug: o.slug });
    const passwordHash = await argon2.hash(PASSWORD);
    const profile = (name: string, keys: string[]) => at((tx) => tx.permissionProfile.create({ data: { organizationId: org.id, name: `${name}-${run}`, permissionsJson: JSON.stringify(keys) } }));
    const hr = await profile('hr', ['org.settings.manage', 'org.structure.view']);
    const payset = await profile('payset', ['org.settings.manage', 'payroll.run.approve', 'payroll.loan.approve']);
    const fin = await profile('fin', ['payroll.run.approve']);
    ids.audit = (await profile('auditkey', ['audit.view'])).id;
    const roster: [string, string, string | null][] = [['admin', 'org_admin', null], ['hr', 'panel', hr.id], ['payset', 'panel', payset.id], ['fin', 'panel', fin.id], ['emp', 'panel', null], ['mgr', 'panel', null], ['dir', 'panel', null], ['viewer', 'panel', null]];
    for (const [who, role, permissionProfileId] of roster) {
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: org.id, email: `${who}@e2e-${run}.test`, name: who === 'emp' ? `Ravi <b>${run}</b>` : `${who} ${run}`, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.slug, email: `${who}@e2e-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    await at(async (tx) => {
      const base = { organizationId: org.id };
      ids.e1 = (await tx.legalEntity.create({ data: { ...base, name: `E2E One ${run}`, shortName: `E2E-${run}`, isDefault: true } })).id;
      ids.loc = (await tx.location.create({ data: { ...base, legalEntityId: ids.e1, name: 'Chennai', code: 'MAA', address: {}, country: 'IN', state: 'IN-TN', timezone: 'Asia/Kolkata' } })).id;
      const d = randomUUID();
      ids.dept = (await tx.department.create({ data: { ...base, id: d, name: 'OPS', code: 'OPS', path: `/${d}/` } })).id;
      ids.desig = (await tx.designation.create({ data: { ...base, name: 'Analyst', code: 'ANL' } })).id;
      ids.perm = (await tx.employmentType.create({ data: { ...base, name: 'Permanent', code: 'PERM', category: 'permanent' } })).id;
      for (const [k, rank] of [['g1', 1], ['g2', 2], ['g3', 3]] as const) ids[k] = (await tx.grade.create({ data: { ...base, name: `${k.toUpperCase()}-${run}`, code: k.toUpperCase(), rank } })).id;
      ids.group = (await tx.userGroup.create({ data: { ...base, name: `Finance ${run}` } })).id;
      await tx.userGroupMember.create({ data: { ...base, groupId: ids.group, userId: users.fin! } });
    });
    const hire = async (who: string, grade: string, manager: string | null) =>
      (
        await api('admin', 'post', '/people/employees')
          .send({ legalEntityId: ids.e1, status: 'confirmed', reason: 'Joined', givenName: who, familyName: run, joinedOn: today, userId: users[who], workEmail: `${who}@e2e-${run}.test`, assignment: { locationId: ids.loc, departmentId: ids.dept, designationId: ids.desig, employmentTypeId: ids.perm, gradeId: ids[grade], managerEmployeeId: manager } })
          .expect(201)
      ).body.id as string;
    ids.dirEmp = await hire('dir', 'g3', null);
    ids.mgrEmp = await hire('mgr', 'g2', ids.dirEmp);
    ids.empEmp = await hire('emp', 'g1', ids.mgrEmp);
    ids.empPerson = (await at((tx) => tx.employee.findUniqueOrThrow({ where: { id: ids.empEmp }, select: { personId: true } }))).personId;
  }, 240_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const all = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: all } } });
        await tx.session.deleteMany({ where: { userId: { in: all } } });
        await tx.organization.deleteMany({ where: { id: org.id } });
        await tx.user.deleteMany({ where: { organizationId: org.id } });
      })
      .catch((e) => console.warn('cleanup', e));
    await prisma.plan.delete({ where: { id: ids.plan } }).catch(() => undefined);
    await app.close();
  });

  describe('part 4: the types the editor covers', () => {
    it('lists every type by area with how far it can change; pay run types are built in and cannot change', async () => {
      const types = (await api('hr', 'get', '/workflow/policies').expect(200)).body.types as { key: string; group: string; mode: string; fields: { key: string }[] }[];
      expect(types.find((t) => t.key === 'ats.requisition')).toMatchObject({ group: 'Hiring', mode: 'full' });
      expect(types.find((t) => t.key === 'org.position_change')).toMatchObject({ mode: 'full' });
      expect(types.find((t) => t.key === 'payroll.one_time')).toMatchObject({ group: 'Pay', mode: 'addon' });
      expect(types.find((t) => t.key === 'payroll.run')).toMatchObject({ mode: 'locked' });
      // The hiring manager's id is carried, never offered as a condition.
      expect(types.find((t) => t.key === 'ats.offer')!.fields.map((f) => f.key)).toEqual(['amount', 'above_range']);
      await api('viewer', 'get', '/workflow/policies').expect(403);
      // Pay types: the pay key first (review item 4), then "built in".
      await api('hr', 'put', '/workflow/policies/payroll.run').send({ steps: [HR], version: 0 }).expect(403);
      expect((await api('payset', 'put', '/workflow/policies/payroll.run').send({ steps: [HR], version: 0 }).expect(400)).body.message).toMatch(/built in and cannot change/);
      await api('payset', 'post', '/workflow/policies/payroll.run/reset').send({ version: 1 }).expect(404);
    });

    it('add-on pay types: steps come after the module\'s, only for people who hold the key', async () => {
      await api('hr', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'Finance', approver: 'users', mode: 'any', userIds: [users.fin] }], version: 0 }).expect(403);
      expect((await api('payset', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'Boss', approver: 'manager', mode: 'any' }], version: 0 }).expect(400)).body.message).toMatch(/named people, a group/);
      expect((await api('payset', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'Mine', approver: 'users', mode: 'any', userIds: [users.mgr] }], version: 0 }).expect(400)).body.message).toMatch(/without payroll\.run\.approve: mgr/);
      expect((await api('payset', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'Holders', approver: 'key_holders', mode: 'any', key: 'org.settings.manage', scope: 'entity' }], version: 0 }).expect(400)).body.message).toMatch(/must hold payroll\.run\.approve/);
      await api('payset', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'Finance group', approver: 'group', mode: 'any', groupId: ids.group }], version: 0 }).expect(200);
      const built: StepSpec[] = [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: [users.payset!] }], mode: 'any', required: true }];
      const r = await at((tx) => engine.route(tx, ctx(), { ...input('payroll.one_time', { amount: 5000 }, built), alwaysRoute: false }));
      expect(r.steps.map((s) => s.name)).toEqual(['Payroll approval', 'Finance group']);
      expect(r.steps[1]!.approverIds).toEqual([users.fin]);
    });

    it('hiring: rules on the requisition\'s values pick the route; the required step stays; the hiring manager approves', async () => {
      const v = await version('ats.requisition');
      await api('hr', 'put', '/workflow/policies/ats.requisition')
        .send({ rules: [{ name: 'Many openings', when: when('openings', 'gt', 3), steps: [{ name: 'Director', approver: 'users', mode: 'any', userIds: [users.dir] }] }], steps: [{ name: 'Hiring manager', approver: 'hiring_manager', mode: 'any' }], version: v })
        .expect(200);
      const required: StepSpec[] = [{ name: 'Outside the plan', approvers: [{ kind: 'users', userIds: [users.fin!] }], mode: 'any', required: true }];
      const big = await at((tx) => engine.route(tx, ctx(), input('ats.requisition', { openings: 5, hiring_manager_id: users.mgr }, required)));
      expect(big.rule).toBe('Many openings');
      expect(big.steps.map((s) => [s.name, s.approverIds])).toEqual([['Director', [users.dir]], ['Outside the plan', [users.fin]]]);
      const small = await at((tx) => engine.route(tx, ctx(), input('ats.requisition', { openings: 1, hiring_manager_id: users.mgr })));
      expect(small.rule).toBe('Otherwise');
      expect(small.steps.map((s) => [s.name, s.approverIds])).toEqual([['Hiring manager', [users.mgr]]]);
    });
  });

  describe('part 5: what a save refuses', () => {
    it('a limit step before the family has limits; the limits API (positive and negative)', async () => {
      const v = await version('expense.claim');
      const limitStep = { name: 'Up to the limit', approver: 'chain_limit', mode: 'any' };
      expect((await api('hr', 'put', '/workflow/policies/expense.claim').send({ steps: [limitStep], version: v }).expect(400)).body.message).toMatch(/Set the approval limits for expenses first/);
      await api('hr', 'put', '/workflow/approval-limits/expense').send({ rows: [{ gradeId: randomUUID(), amount: '1000' }] }).expect(400);
      await api('hr', 'put', '/workflow/approval-limits/expense').send({ rows: [{ gradeId: ids.g2, amount: '-5' }] }).expect(400);
      await api('hr', 'put', '/workflow/approval-limits/travel').send({ rows: [] }).expect(404);
      await api('hr', 'put', '/workflow/approval-limits/pay').send({ rows: [{ gradeId: ids.g2, amount: '1000' }] }).expect(403);
      await api('viewer', 'get', '/workflow/approval-limits').expect(403);
      const lim = (await api('hr', 'put', '/workflow/approval-limits/expense').send({ rows: [{ gradeId: ids.g2, amount: '50000' }, { gradeId: ids.g3, amount: '200000.50' }] }).expect(200)).body;
      expect(lim.families.find((f: { key: string }) => f.key === 'expense').rows).toEqual(expect.arrayContaining([{ gradeId: ids.g2, amount: '50000.00' }, { gradeId: ids.g3, amount: '200000.50' }]));
      await api('hr', 'put', '/workflow/policies/expense.claim').send({ steps: [limitStep], version: v }).expect(200);
      // Limits a saved policy goes by cannot all be removed.
      expect((await api('hr', 'put', '/workflow/approval-limits/expense').send({ rows: [] }).expect(400)).body.message).toMatch(/Expense claim/);
    });

    it('two grades sharing a rank in a legal entity', async () => {
      const twin = await at((tx) => tx.grade.create({ data: { organizationId: org.id, name: `Twin-${run}`, code: 'TW', rank: 2 } }));
      const v = await version('expense.advance');
      expect((await api('hr', 'put', '/workflow/policies/expense.advance').send({ steps: [{ name: 'Up to G3', approver: 'chain_grade', mode: 'any', gradeId: ids.g3 }], version: v }).expect(400)).body.message).toMatch(/share rank 2/);
      await at((tx) => tx.grade.update({ where: { id: twin.id }, data: { archivedAt: new Date() } }));
      await api('hr', 'put', '/workflow/policies/expense.advance').send({ steps: [{ name: 'Up to G3', approver: 'chain_grade', mode: 'any', gradeId: ids.g3 }], version: v }).expect(200);
    });

    it('"all" or a number on key holders who can be more than 25; "any one" is fine', async () => {
      const many = await at((tx) => tx.permissionProfile.create({ data: { organizationId: org.id, name: `many-${run}`, permissionsJson: JSON.stringify(['expense.report.view']) } }));
      await at((tx) => tx.user.createMany({ data: Array.from({ length: 26 }, (_, i) => ({ organizationId: org.id, email: `k${i}@e2e-${run}.test`, name: `Key ${i}`, passwordHash: 'x', role: 'panel', permissionProfileId: many.id })) }));
      const v = await version('expense.trip');
      const step = (mode: string) => ({ name: 'Report readers', approver: 'key_holders', mode, ...(mode === 'count' ? { count: 2 } : {}), key: 'expense.report.view', scope: 'entity' });
      expect((await api('hr', 'put', '/workflow/policies/expense.trip').send({ steps: [step('all')], version: v }).expect(400)).body.message).toMatch(/more than 25 people can hold/);
      await api('hr', 'put', '/workflow/policies/expense.trip').send({ steps: [step('count')], version: v }).expect(400);
      expect((await api('hr', 'put', '/workflow/policies/expense.trip').send({ steps: [{ ...step('any'), key: 'no.such.key' }], version: v }).expect(400)).body.message).toMatch(/not a key/);
      await api('hr', 'put', '/workflow/policies/expense.trip').send({ steps: [step('any')], version: v }).expect(200);
    });

    it('a group the company does not have, and people who are not active here', async () => {
      const v = await version('time.timesheet');
      expect((await api('hr', 'put', '/workflow/policies/time.timesheet').send({ steps: [{ name: 'Group', approver: 'group', mode: 'any', groupId: randomUUID() }], version: v }).expect(400)).body.message).toMatch(/not in this company/);
      await api('hr', 'put', '/workflow/policies/time.timesheet').send({ steps: [{ name: 'People', approver: 'users', mode: 'any', userIds: [randomUUID()] }], version: v }).expect(400);
      await api('hr', 'put', '/workflow/policies/time.timesheet').send({ steps: [{ name: 'Group', approver: 'group', mode: 'all', groupId: ids.group }], version: v }).expect(200);
    });
  });

  describe('part 5: "Try it" runs the route submit uses', () => {
    it('on sample values: the matching rule and its people; a draft instead of the saved policy; refusals', async () => {
      const r = (await api('hr', 'post', '/workflow/policies/ats.requisition/try').send({ values: { openings: 4 } }).expect(200)).body;
      expect(r.rule).toBe('Many openings');
      expect(r.steps[0]).toMatchObject({ name: 'Director', from: 'company', approvers: [`dir ${run}`] });
      const d = (await api('hr', 'post', '/workflow/policies/ats.requisition/try').send({ values: { openings: 4 }, draft: { rules: [], steps: [HR] } }).expect(200)).body;
      expect(d).toMatchObject({ rule: 'Otherwise', steps: [{ name: 'HR look', approvers: expect.arrayContaining([`hr ${run}`]) }] });
      await api('hr', 'post', '/workflow/policies/ats.requisition/try').send({ values: { openings: 'many' } }).expect(400);
      await api('hr', 'post', '/workflow/policies/ats.requisition/try').send({ draft: { steps: [] } }).expect(400);
      await api('hr', 'post', '/workflow/policies/leave.nothing/try').send({}).expect(404);
      await api('viewer', 'post', '/workflow/policies/ats.requisition/try').send({}).expect(403);
    });

    it('on a past request: the same people the request was sent to', async () => {
      const sub = await at((tx) => engine.submit(tx, ctx(), { ...input('ats.requisition', { openings: 9, outside_plan: 'no', replacement: 'no', hiring_manager_id: users.mgr }, [{ name: 'Recruiting', approvers: [{ kind: 'users', userIds: [users.fin!] }], mode: 'any', required: true }]), alwaysRoute: true }));
      const frozen = (await at((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sub.id } }))).steps as { name: string; approverIds: string[] }[];
      const past = (await api('hr', 'get', '/workflow/policies/ats.requisition/requests').expect(200)).body as { id: string }[];
      expect(past.map((p) => p.id)).toContain(sub.id);
      const tried = (await api('hr', 'post', '/workflow/policies/ats.requisition/try').send({ requestId: sub.id }).expect(200)).body;
      expect(tried.values).toMatchObject({ openings: 9 });
      const names = new Map([[users.dir, `dir ${run}`], [users.fin, `fin ${run}`]]);
      expect(tried.steps.map((s: { name: string; approvers: string[] }) => [s.name, s.approvers])).toEqual(frozen.map((s) => [s.name, s.approverIds.map((u) => names.get(u))]));
      await api('hr', 'post', '/workflow/policies/ats.offer/try').send({ requestId: sub.id }).expect(404);
    });
  });

  describe('part 6: moving the old hiring chains', () => {
    it('dry run: a matching offer chain moves; a requisition chain whose manager differs is listed and stays', async () => {
      // The requisition policy saved above is not "moved"; start the requisition side from the old chain only.
      await api('hr', 'post', '/workflow/policies/ats.requisition/reset').send({ version: await version('ats.requisition') }).expect(200);
      await at(async (tx) => {
        const offer = await tx.approvalChain.create({ data: { organizationId: org.id, gate: 'offer', enabled: true } });
        await tx.approvalChainStep.create({ data: { chainId: offer.id, position: 0, name: 'Finance', approverType: 'users', approverUserIds: JSON.stringify([users.fin]) } });
        const req = await tx.approvalChain.create({ data: { organizationId: org.id, gate: 'requisition', enabled: true } });
        await tx.approvalChainStep.create({ data: { chainId: req.id, position: 0, name: 'Manager', approverType: 'reporting_manager', managerLevel: 1 } });
        // The login's manager says dir; the employee record says mgr.
        await tx.user.update({ where: { id: users.emp }, data: { managerId: users.dir } });
      });
      const dry = (await api('hr', 'get', '/workflow/hiring-move').expect(200)).body as { type: string; status: string; differences: { step: string; old: string[]; new: string[] }[] }[];
      expect(dry.find((r) => r.type === 'ats.offer')!.status).toBe('match');
      const req = dry.find((r) => r.type === 'ats.requisition')!;
      expect(req.status).toBe('differs');
      expect(req.differences).toEqual(expect.arrayContaining([expect.objectContaining({ step: 'Manager', old: [`dir ${run}`], new: [`mgr ${run}`] })]));
      await api('viewer', 'get', '/workflow/hiring-move').expect(403);
      const moved = (await api('hr', 'post', '/workflow/hiring-move').expect(200)).body;
      expect(moved.moved).toEqual(['ats.offer']);
      const pol = await at((tx) => tx.approvalPolicy.findFirstOrThrow({ where: { organizationId: org.id, requestType: 'ats.offer' } }));
      expect(pol.steps).toEqual([{ name: 'Finance', approver: 'users', mode: 'any', userIds: [users.fin] }]);
      expect(await at((tx) => tx.approvalPolicy.count({ where: { organizationId: org.id, requestType: 'ats.requisition' } }))).toBe(0);
      // Re-runnable: nothing more moves.
      const again = (await api('hr', 'post', '/workflow/hiring-move').expect(200)).body;
      expect(again.moved).toEqual([]);
      expect(again.rows.find((r: { type: string }) => r.type === 'ats.offer').status).toBe('moved');
    });
  });

  describe('part 7: hiring notices', () => {
    it('editable per event for requisitions and offers only; merge fields only; plain text', async () => {
      const list = (await api('hr', 'get', '/workflow/policies/ats.requisition/notices').expect(200)).body;
      expect(list.events.map((e: { event: string }) => e.event)).toEqual(['requested', 'reminder', 'escalated', 'approved', 'turned_down', 'sent_back']);
      await api('hr', 'get', '/workflow/policies/leave.request/notices').expect(404);
      await api('hr', 'put', '/workflow/policies/ats.requisition/notices/approved_late').send({ subject: 'Hi there', body: 'Hello there' }).expect(404);
      expect((await api('hr', 'put', '/workflow/policies/ats.requisition/notices/requested').send({ subject: 'Hi {summary}', body: 'Hello' }).expect(400)).body.message).toMatch(/not a merge field/);
      await api('hr', 'put', '/workflow/policies/ats.requisition/notices/requested').send({ subject: 'Hi <b>', body: 'Hello there' }).expect(400);
      await api('viewer', 'put', '/workflow/policies/ats.requisition/notices/requested').send({ subject: 'Hi there', body: 'Hello there' }).expect(403);
      const saved = (await api('hr', 'put', '/workflow/policies/ats.requisition/notices/requested').send({ subject: 'Please approve: {title}', body: '{requester} needs your OK at step {step}.\n\nOpen it: {link}' }).expect(200)).body;
      expect(saved.events[0]).toMatchObject({ event: 'requested', own: true, subject: 'Please approve: {title}' });
    });

    it('the email uses the company text, escapes every value and never carries the summary', async () => {
      sent.length = 0;
      const sub = await at((tx) => engine.submit(tx, ctx(), { ...input('ats.requisition', { openings: 1, hiring_manager_id: users.mgr }), steps: [{ name: 'Recruiting', approvers: [{ kind: 'users', userIds: [users.mgr!] }], mode: 'any' }] }));
      await engine.send(ctx(), sub.notices.map((n) => ({ ...n, actor: users.emp })));
      const mail = sent.find((m) => m.to === `mgr@e2e-${run}.test`)!;
      expect(mail.subject).toBe(`Please approve: E2 editor ${run}`);
      expect(mail.html).toContain(`Ravi &lt;b&gt;${run}&lt;/b&gt; needs your OK at step`);
      expect(mail.html).not.toContain(`<b>${run}`);
      expect(mail.html).not.toContain('99,00,000');
      // Back to the standard notice.
      await api('hr', 'post', '/workflow/policies/ats.requisition/notices/requested/reset').expect(200);
      sent.length = 0;
      const again = await at((tx) => engine.submit(tx, ctx(), { ...input('ats.requisition', { openings: 1 }), steps: [{ name: 'Recruiting', approvers: [{ kind: 'users', userIds: [users.mgr!] }], mode: 'any' }] }));
      await engine.send(ctx(), again.notices);
      expect(sent.find((m) => m.to === `mgr@e2e-${run}.test`)!.subject).not.toMatch(/^Please approve/);
    });
  });
});
