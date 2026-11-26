import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import { POLICY_TYPES } from '../src/workflow/approval-policies';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-6, 2.4 Approvals (answer 1330), against the real database (forced RLS, app role): a company's own approval
// steps per request type on the shared engine; nobody approves their own request; the reminder and escalation fire at
// the company's hours; every change is audited; one company never sees another's policies.
describe('Settings S-6: approval policies', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let engine: ApprovalsEngine;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const api = (who: string, method: 'get' | 'put' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctxA = () => ({ organizationId: org.A!, isSuperAdmin: false });
  const TWO_STEPS = [{ name: 'HR first look', approver: 'hr', mode: 'any' }, { name: 'HR together', approver: 'hr', mode: 'all' }];
  const submit = (requester: string, steps = [{ name: 'Built-in manager', approvers: [{ kind: 'users' as const, userIds: [users.hr2A!] }], mode: 'any' as const }]) =>
    tenantPrisma.forTenant(ctxA(), (tx) =>
      engine.submit(tx, ctxA(), { type: 'leave.request', subjectType: 'test', subjectId: randomUUID(), title: `Test leave ${run}`, summary: [], subjectPersonId: null, requesterUserId: users[requester]!, raisedByUserId: users[requester]!, steps, payload: {}, payloadFields: [], fallbackUserIds: [] }),
    );
  const tasks = (requestId: string) => tenantPrisma.forTenant(ctxA(), (tx) => tx.wfTask.findMany({ where: { organizationId: org.A!, requestId }, orderBy: { createdAt: 'asc' } }));
  const decide = (who: string, taskId: string) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/decide`).send({ decision: 'approve' });

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    engine = app.get(ApprovalsEngine);
    // The test's requests are not real leave: their effects are switched off here (the route is what is tested).
    engine.register({ key: 'leave.request', label: 'Leave', risk: 'normal', autoActions: false, onDecided: async () => undefined, requesterLink: () => '/yx/time/leave' });
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s6-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `s6-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `S6 ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      const people: [string, string[]][] = k === 'A' ? [['hr1', ['org.settings.manage']], ['hr2', ['org.settings.manage']], ['hr3', ['org.settings.manage']], ['viewer', ['org.structure.view']], ['plain', []]] : [['hr1', ['org.settings.manage']]];
      for (const [who, keys] of people) {
        const permissionProfileId = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
        const email = `${who}-${k.toLowerCase()}-${run}@s6.test`;
        const id = `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
        await markSteppedUp(tenantPrisma, token[id]!);
      }
    }
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('who may see and change them', () => {
    it('the settings key changes them; the view key reads them; nobody else', async () => {
      const list = (await api('viewerA', 'get', '/workflow/policies').expect(200)).body;
      expect(list).toMatchObject({ remindHours: 24, escalateHours: 48 });
      expect(list.types.find((t: { key: string }) => t.key === 'leave.request')).toMatchObject({ steps: null, version: 0, approvers: expect.stringMatching(/^Manager; HR too when the leave is longer/) });
      await api('viewerA', 'put', '/workflow/policies/leave.request').send({ steps: TWO_STEPS, version: 0 }).expect(403);
      await api('plainA', 'get', '/workflow/policies').expect(403);
    });

    it('bad steps, an unknown or guarded type and a stale version are refused', async () => {
      await api('hr1A', 'put', '/workflow/policies/leave.request').send({ steps: [], version: 0 }).expect(400);
      await api('hr1A', 'put', '/workflow/policies/leave.request').send({ steps: [{ name: 'X', approver: 'hr', mode: 'any' }], version: 0 }).expect(400);
      await api('hr1A', 'put', '/workflow/policies/leave.request').send({ steps: [{ name: 'Boss', approver: 'ceo', mode: 'any' }], version: 0 }).expect(400);
      // E2 review item 4: a pay type first needs the pay approve key (403 for an HR Admin without it).
      await api('hr1A', 'put', '/workflow/policies/payroll.run').send({ steps: TWO_STEPS, version: 0 }).expect(403);
      await api('hr1A', 'put', '/workflow/policies/leave.request').send({ steps: TWO_STEPS, version: 3 }).expect(409);
    });

    it('a change is saved as a new version and audited with before and after', async () => {
      const body = (await api('hr1A', 'put', '/workflow/policies/leave.request').send({ steps: TWO_STEPS, version: 0 }).expect(200)).body;
      expect(body.types.find((t: { key: string }) => t.key === 'leave.request')).toMatchObject({ version: 1, approvers: 'HR Admins → HR Admins', updatedBy: `hr1 A ${run}` });
      const rows = await tenantPrisma.forTenant(ctxA(), (tx) => tx.auditLog.findMany({ where: { organizationId: org.A!, action: 'workflow.policy.changed' } }));
      expect(rows).toHaveLength(1);
      expect(JSON.parse(rows[0]!.metadataJson!)).toMatchObject({ type: 'leave.request', before: null, after: TWO_STEPS });
    });

    it('one company never sees another company’s policies', async () => {
      const b = (await api('hr1B', 'get', '/workflow/policies').expect(200)).body;
      expect(b.types.find((t: { key: string }) => t.key === 'leave.request')).toMatchObject({ steps: null, version: 0 });
      expect(await tenantPrisma.forTenant({ organizationId: org.B!, isSuperAdmin: false }, (tx) => tx.approvalPolicy.findMany({ where: { organizationId: org.A! } }))).toEqual([]);
    });
  });

  describe('a request follows its steps', () => {
    it('the company steps replace the module ones; the requester is never an approver; step 2 needs all', async () => {
      const sent = await submit('hr1A');
      const req = await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sent.id } }));
      const steps = req.steps as { name: string; approverIds: string[] }[];
      expect(steps.map((s) => s.name)).toEqual(['HR first look', 'HR together']);
      for (const s of steps) expect(s.approverIds.sort()).toEqual([users.hr2A!, users.hr3A!].sort());
      // Step 1: any one. The requester has no task and cannot decide.
      const t1 = await tasks(sent.id);
      expect(t1.map((t) => t.assigneeUserId).sort()).toEqual([users.hr2A!, users.hr3A!].sort());
      await decide('hr1A', t1[0]!.id).expect((r) => expect([403, 404]).toContain(r.status));
      await decide('hr2A', t1.find((t) => t.assigneeUserId === users.hr2A)!.id).expect(200);
      // Step 2: all of them.
      const t2 = (await tasks(sent.id)).filter((t) => t.step === 1);
      expect(t2).toHaveLength(2);
      await decide('hr2A', t2.find((t) => t.assigneeUserId === users.hr2A)!.id).expect(200);
      expect((await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sent.id } }))).status).toBe('pending');
      await decide('hr3A', t2.find((t) => t.assigneeUserId === users.hr3A)!.id).expect(200);
      expect((await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sent.id } }))).status).toBe('approved');
    });

    it('back to the built-in steps (audited): the module steps apply again', async () => {
      await api('hr1A', 'post', '/workflow/policies/leave.request/reset').send({ version: 1 }).expect(200);
      const sent = await submit('hr1A');
      const req = await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sent.id } }));
      expect((req.steps as { name: string }[]).map((s) => s.name)).toEqual(['Built-in manager']);
      const rows = await tenantPrisma.forTenant(ctxA(), (tx) => tx.auditLog.findMany({ where: { organizationId: org.A!, action: 'workflow.policy.reset' } }));
      expect(rows).toHaveLength(1);
    });
  });

  // E2 review item 1: a company's own steps never drop a module's required control step (cost-centre owner, finance check,
  // HR above the allowance, the colleague of a swap, the travel desk, the payroll approver...): the engine adds it after them.
  describe('E2 review item 4: separation of duties on pay types', () => {
    it('an HR Admin without the pay approve key cannot change who approves pay (403), whatever the steps', async () => {
      for (const type of ['payroll.one_time', 'payroll.loan', 'payroll.run'])
        expect((await api('hr1A', 'put', `/workflow/policies/${type}`).send({ steps: [{ name: 'My friend', approver: 'manager', mode: 'any' }], version: 0 }).expect(403)).body.message).toMatch(/payroll\.run\.approve in every legal entity/);
      expect(await tenantPrisma.forTenant(ctxA(), (tx) => tx.approvalPolicy.count({ where: { organizationId: org.A!, requestType: { startsWith: 'payroll.' } } }))).toBe(0);
    });
    it('a holder of the key cannot route pay to HR Admins who lack it (400, naming them); pay types are not editable yet (404)', async () => {
      // A payroll approver who may change settings; switched off at the end so the other tests' HR Admins stay as they are.
      const slug = (await prisma.organization.findUniqueOrThrow({ where: { id: org.A! } })).slug;
      const email = `payset-a-${run}@s6.test`;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(ctxA(), fn);
      const profile = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org.A!, name: `payset-${run}`, permissionsJson: JSON.stringify(['org.settings.manage', 'payroll.run.approve']) } }))).id;
      const passwordHash = await argon2.hash(PASSWORD);
      users.paysetA = (await at((tx) => tx.user.create({ data: { organizationId: org.A!, email, name: `payset A ${run}`, passwordHash, role: 'panel', permissionProfileId: profile } }))).id;
      token.paysetA = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token.paysetA!);
      expect((await api('paysetA', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'HR look', approver: 'hr', mode: 'any' }], version: 0 }).expect(400)).body.message).toMatch(/people without payroll\.run\.approve: .*hr1 A/);
      await api('paysetA', 'put', '/workflow/policies/payroll.one_time').send({ steps: [{ name: 'Manager look', approver: 'manager', mode: 'any' }], version: 0 }).expect(404);
      await at((tx) => tx.user.update({ where: { id: users.paysetA! }, data: { status: 'inactive' } }));
    });
  });

  describe('E2 review item 1: required module steps survive a saved policy', () => {
    it.each(POLICY_TYPES.map((t) => t.key))('%s: the saved step comes first, then the required control; a plain built-in step is replaced', async (type) => {
      const cur = ((await api('hr1A', 'get', '/workflow/policies').expect(200)).body.types as { key: string; version: number }[]).find((t) => t.key === type)!;
      await api('hr1A', 'put', `/workflow/policies/${type}`).send({ steps: [{ name: 'Company first look', approver: 'hr', mode: 'any' }], version: cur.version }).expect(200);
      const builtIn = [
        { name: 'Built-in manager', approvers: [{ kind: 'users' as const, userIds: [users.hr2A!] }], mode: 'any' as const },
        { name: 'Required control', approvers: [{ kind: 'users' as const, userIds: [users.hr3A!] }], mode: 'any' as const, required: true },
      ];
      const sent = await tenantPrisma.forTenant(ctxA(), (tx) =>
        engine.submit(tx, ctxA(), { type, subjectType: 'test', subjectId: randomUUID(), title: `Test ${type} ${run}`, summary: [], subjectPersonId: null, requesterUserId: users.hr1A!, raisedByUserId: users.hr1A!, steps: builtIn, payload: {}, payloadFields: [], fallbackUserIds: [] }),
      );
      const req = await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sent.id } }));
      expect((req.steps as { name: string }[]).map((s) => s.name)).toEqual(['Company first look', 'Required control']);
      await api('hr1A', 'post', `/workflow/policies/${type}/reset`).send({ version: cur.version + 1 }).expect(200);
    });
  });

  describe('reminder and escalation at the company hours', () => {
    it('the hours are company settings (24 and 48 by default); a reminder and then escalation fire at the set hours', async () => {
      await api('hr1A', 'put', '/org/settings').send({ key: 'approval.remind_hours', value: '4', scopeType: 'tenant' }).expect(200);
      await api('hr1A', 'put', '/org/settings').send({ key: 'approval.escalate_hours', value: '24', scopeType: 'tenant' }).expect(200);
      await api('hr1A', 'put', '/workflow/policies/leave.request').send({ steps: [{ name: 'HR', approver: 'hr', mode: 'any' }], version: 0 }).expect(200);
      const start = Date.now();
      const sent = await submit('hr1A');
      const [t] = await tasks(sent.id);
      expect(Math.round((t!.remindAt!.getTime() - start) / 3_600_000)).toBe(4);
      expect(Math.round((t!.dueAt!.getTime() - start) / 3_600_000)).toBe(24);
      // Nothing before the reminder time.
      await engine.tick(new Date(start + 3.5 * 3_600_000));
      expect((await tasks(sent.id))[0]!.reminders).toBe(0);
      await engine.tick(new Date(start + 4 * 3_600_000 + 60_000));
      expect((await tasks(sent.id)).find((x) => x.id === t!.id)!.reminders).toBe(1);
      await engine.tick(new Date(start + 24 * 3_600_000 + 60_000));
      expect((await tasks(sent.id)).find((x) => x.id === t!.id)!.escalatedAt).not.toBeNull();
      const log = await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfAction.findMany({ where: { organizationId: org.A!, requestId: sent.id }, select: { action: true } }));
      expect(log.map((a) => a.action)).toEqual(expect.arrayContaining(['reminded', 'escalated']));
    });

    it('answer 1765: a leave request on built-in steps reminds and escalates at the company hours, not the module ones', async () => {
      await api('hr1A', 'post', '/workflow/policies/leave.request/reset').send({ version: 1 }).expect(200);
      const start = Date.now();
      const sent = await submit('hr1A', [{ name: 'Built-in manager', approvers: [{ kind: 'users' as const, userIds: [users.hr2A!] }], mode: 'any' as const, remindAfterHours: 24, timeoutHours: 72, onTimeout: 'escalate' as const } as never]);
      const req = await tenantPrisma.forTenant(ctxA(), (tx) => tx.wfRequest.findFirstOrThrow({ where: { id: sent.id } }));
      expect((req.steps as { name: string }[]).map((s) => s.name)).toEqual(['Built-in manager']);
      const [t] = await tasks(sent.id);
      expect(Math.round((t!.remindAt!.getTime() - start) / 3_600_000)).toBe(4);
      expect(Math.round((t!.dueAt!.getTime() - start) / 3_600_000)).toBe(24);
      await engine.tick(new Date(start + 4 * 3_600_000 + 60_000));
      expect((await tasks(sent.id)).find((x) => x.id === t!.id)!.reminders).toBe(1);
    });

    it('negative (1765): a step for named people only is reminded but never escalated past them; a request type outside the 13 keeps its module hours', async () => {
      const start = Date.now();
      const named = await submit('hr1A', [{ name: 'Colleague agrees', approvers: [{ kind: 'users' as const, userIds: [users.hr2A!] }], mode: 'any' as const, remindAfterHours: 12 } as never]);
      const [n] = await tasks(named.id);
      expect(Math.round((n!.remindAt!.getTime() - start) / 3_600_000)).toBe(4);
      expect(n!.dueAt).toBeNull();
            // Payroll one-time pay is outside the 13 (its module is registered with the app; the request is only routed here).
      const other = await tenantPrisma.forTenant(ctxA(), (tx) =>
        engine.submit(tx, ctxA(), { type: 'payroll.one_time', subjectType: 'test', subjectId: randomUUID(), title: `Guarded ${run}`, summary: [], subjectPersonId: null, requesterUserId: users.hr1A!, raisedByUserId: users.hr1A!, steps: [{ name: 'Payroll approval', approvers: [{ kind: 'users', userIds: [users.hr2A!] }], mode: 'any', remindAfterHours: 24 }], payload: {}, payloadFields: [], fallbackUserIds: [] }),
      );
      const [o] = await tasks(other.id);
      expect(Math.round((o!.remindAt!.getTime() - start) / 3_600_000)).toBe(24);
      expect(o!.dueAt).toBeNull();
    });
  });
});
