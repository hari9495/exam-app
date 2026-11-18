import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { ApprovalsEngine } from '../src/workflow/approvals-engine.service';
import { markSteppedUp } from './fixtures/step-up';

// Batch C item 4 (answers 2500 to 2502) against the real database (forced RLS, app role): HR with
// workflow.approvals.oversee sees everyone's pending approvals in scope (company-wide, or the people of their legal
// entity) and moves one to another approver with a reason; the approver can move their own. Never to the requester,
// someone inactive, someone already on the step, or who approved an earlier step of a maker-checker type; audited; both
// approvers told. Refusals: no key, out of scope, another company, no reason, acting for someone else.
describe('Approvals: everyone’s pending and reassign (batch C item 4)', () => {
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
  const ids: Record<string, string> = {};
  let planId = '';
  const send = jest.fn(async (_m: { to: string; subject: string }) => ({ success: true }));
  const api = (who: string, method: 'get' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const ctxA = () => ({ organizationId: org.A!, isSuperAdmin: false });
  const atA = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(ctxA(), fn);
  const submit = (requester: string, personId: string | null, approver: string, type = 'test.oversee') =>
    atA((tx) => engine.submit(tx, ctxA(), { type, subjectType: 'test', subjectId: randomUUID(), title: `Request of ${requester} ${run}`, summary: [], subjectPersonId: personId, requesterUserId: users[requester]!, raisedByUserId: users[requester]!, steps: [{ name: 'Manager', approvers: [{ kind: 'users', userIds: [users[approver]!] }], mode: 'any' }, { name: 'Head', approvers: [{ kind: 'users', userIds: [users.head!] }], mode: 'any' }], payload: {}, payloadFields: [], fallbackUserIds: [] }));
  const taskOf = async (requestId: string) => atA((tx) => tx.wfTask.findFirstOrThrow({ where: { requestId, status: 'open' } }));
  const reassign = (who: string, taskId: string, body: Record<string, unknown>) => api(who, 'post', `/workflow/approvals/tasks/${taskId}/reassign`).send(body);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    engine = app.get(ApprovalsEngine);
    engine.register({ key: 'test.oversee', label: 'Test request', risk: 'normal', autoActions: false, onDecided: async () => undefined, requesterLink: () => '/yx/me/requests' });
    engine.register({ key: 'test.oversee_mc', label: 'Maker-checker request', risk: 'normal', autoActions: false, distinctSteps: true, onDecided: async () => undefined, requesterLink: () => '/yx/me/requests' });
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `ov-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `ov-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `OV ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      const people: [string, string[]][] = k === 'A' ? [['hr', ['workflow.approvals.oversee']], ['hrNorth', []], ['emp', []], ['emp2', []], ['mgr', []], ['mgr2', []], ['head', []], ['plain', []], ['gone', []]] : [['hr', ['workflow.approvals.oversee']]];
      for (const [who, keys] of people) {
        const permissionProfileId = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
        const email = `${who}-${k.toLowerCase()}-${run}@ov.test`;
        const id = k === 'A' ? who : `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${run}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
        await markSteppedUp(tenantPrisma, token[id]!);
      }
    }
    await atA((tx) => tx.user.update({ where: { id: users.gone }, data: { status: 'inactive' } }));
    // Two legal entities; emp works in North, emp2 in South. hrNorth oversees North only (a legal-entity grant).
    await atA(async (tx) => {
      const o = { organizationId: org.A! };
      for (const e of ['North', 'South']) ids[e] = (await tx.legalEntity.create({ data: { ...o, name: `${e} ${run}`, shortName: `${e[0]}${run.slice(0, 4)}` } })).id;
      for (const [who, e] of [['emp', 'North'], ['emp2', 'South']] as const) {
        const person = await tx.person.create({ data: { ...o, givenName: who } });
        ids[`p_${who}`] = person.id;
        const emp = await tx.employee.create({ data: { ...o, personId: person.id, givenName: who } });
        await tx.employment.create({ data: { ...o, employeeId: emp.id, legalEntityId: ids[e]!, employeeCode: `${who}-${run}`, codeScopeKey: ids[e]!, joinedOn: new Date('2026-01-05T00:00:00Z') } });
      }
      const role = await tx.permissionProfile.create({ data: { ...o, name: `oversee-north-${run}`, permissionsJson: JSON.stringify(['workflow.approvals.oversee']) } });
      await tx.roleGrant.create({ data: { ...o, userId: users.hrNorth!, permissionProfileId: role.id, scopeType: 'legal_entity', legalEntityId: ids.North!, validFrom: new Date('2020-01-01T00:00:00Z'), status: 'active', reason: 'North HR', grantedBy: users.hr } });
    });
    ids.r1 = (await submit('emp', ids.p_emp!, 'mgr')).id;
    ids.r2 = (await submit('emp2', ids.p_emp2!, 'mgr')).id;
    ids.r3 = (await submit('emp', null, 'mgr')).id;
  }, 240_000);

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

  it('a company-wide overseer sees every pending approval with who holds it; a legal-entity one only their people', async () => {
    const all = (await api('hr', 'get', '/workflow/approvals/everyone').expect(200)).body as { requestId: string; approver: string }[];
    expect(all.map((r) => r.requestId).sort()).toEqual([ids.r1, ids.r2, ids.r3].sort());
    expect(all.every((r) => r.approver === `mgr ${run}`)).toBe(true);
    // North only: the South person's request and the one about nobody are not shown.
    expect(((await api('hrNorth', 'get', '/workflow/approvals/everyone').expect(200)).body as { requestId: string }[]).map((r) => r.requestId)).toEqual([ids.r1]);
    // No key: refused. Another company: sees none of A's.
    await api('plain', 'get', '/workflow/approvals/everyone').expect(403);
    await api('mgr', 'get', '/workflow/approvals/everyone').expect(403);
    expect((await api('hrB', 'get', '/workflow/approvals/everyone').expect(200)).body).toEqual([]);
  });

  it('refusals: no reason, the requester, someone inactive, the same approver, out of scope, another company, no key', async () => {
    const t = await taskOf(ids.r1!);
    await reassign('hr', t.id, { toUserId: users.mgr2 }).expect(400);
    await reassign('hr', t.id, { toUserId: users.mgr2, reason: ' ' }).expect(400);
    expect((await reassign('hr', t.id, { toUserId: users.emp, reason: 'Manager away' }).expect(400)).body.message).toMatch(/cannot approve their own request/);
    expect((await reassign('hr', t.id, { toUserId: users.gone, reason: 'Manager away' }).expect(400)).body.message).toMatch(/active colleague/);
    expect((await reassign('hr', t.id, { toUserId: users.mgr, reason: 'Manager away' }).expect(400)).body.message).toMatch(/already hold/);
    await reassign('hr', t.id, { toUserId: 'not-a-uuid', reason: 'Manager away' }).expect(400);
    // Someone neither holding it nor overseeing it, an overseer of another entity, another company: "not found".
    await reassign('plain', t.id, { toUserId: users.mgr2, reason: 'Manager away' }).expect(404);
    const south = await taskOf(ids.r2!);
    await reassign('hrNorth', south.id, { toUserId: users.mgr2, reason: 'Manager away' }).expect(404);
    await reassign('hrB', t.id, { toUserId: users.mgr2, reason: 'Manager away' }).expect(404);
    expect((await taskOf(ids.r1!)).assigneeUserId).toBe(users.mgr);
  });

  it('HR moves one: the new approver holds it and can decide; logged, audited, both told; the old one cannot decide', async () => {
    const t = await taskOf(ids.r1!);
    send.mockClear();
    const out = (await reassign('hrNorth', t.id, { toUserId: users.mgr2, reason: 'Manager on long leave' }).expect(200)).body;
    expect(out).toMatchObject({ taskId: t.id, to: users.mgr2, toName: `mgr2 ${run}` });
    const req = await atA((tx) => tx.wfRequest.findFirstOrThrow({ where: { id: ids.r1! } }));
    expect((req.steps as { approverIds: string[] }[])[0]!.approverIds).toEqual([users.mgr2]);
    expect(await atA((tx) => tx.wfAction.findFirst({ where: { requestId: ids.r1!, action: 'reassigned' } }))).toMatchObject({ actorUserId: users.hrNorth, reason: 'Manager on long leave' });
    const audit = await atA((tx) => tx.auditLog.findFirstOrThrow({ where: { action: 'workflow.task.reassigned', entityId: ids.r1! } }));
    expect(JSON.parse(audit.metadataJson!)).toMatchObject({ from: users.mgr, to: users.mgr2, reason: 'Manager on long leave', asOverseer: true });
    const bells = await atA((tx) => tx.userNotification.findMany({ where: { entityId: ids.r1!, recipientUserId: { in: [users.mgr!, users.mgr2!] } } }));
    expect(bells.find((b) => b.recipientUserId === users.mgr2)?.type).toBe('workflow.approval.needed');
    expect(bells.find((b) => b.recipientUserId === users.mgr)?.type).toBe('workflow.approval.reassigned');
    expect(send.mock.calls.some(([m]) => m.to === `mgr2-a-${run}@ov.test` && /^Reassigned to you/.test(m.subject))).toBe(true);
    await api('mgr', 'post', `/workflow/approvals/tasks/${t.id}/decide`).send({ decision: 'approve' }).expect(404);
    await api('mgr2', 'post', `/workflow/approvals/tasks/${t.id}/decide`).send({ decision: 'approve' }).expect(200);
    // Decided already: moving it is a conflict.
    await reassign('hr', t.id, { toUserId: users.mgr, reason: 'Again' }).expect(409);
  });

  it('the approver moves their own (no key needed); a maker-checker type never goes to who approved an earlier step', async () => {
    const t = await taskOf(ids.r2!);
    await reassign('mgr', t.id, { toUserId: users.mgr2, reason: 'Mgr2 knows this team' }).expect(200);
    const mc = (await submit('emp', ids.p_emp!, 'mgr', 'test.oversee_mc')).id;
    const first = await taskOf(mc);
    await api('mgr', 'post', `/workflow/approvals/tasks/${first.id}/decide`).send({ decision: 'approve' }).expect(200);
    const second = await taskOf(mc);
    expect((await reassign('hr', second.id, { toUserId: users.mgr, reason: 'Head away' }).expect(400)).body.message).toMatch(/approved an earlier step/);
    await reassign('hr', second.id, { toUserId: users.mgr2, reason: 'Head away' }).expect(200);
  });
});
