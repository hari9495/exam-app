import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import type { BetaMessage } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { ASK_CLIENT } from '../src/help/assistant/assistant-client';
import { KEY_WORDS } from '../src/platform/staff-roles.service';
import { markSteppedUp } from './fixtures/step-up';
import { giveStaffRoles, rolesWithout } from './fixtures/staff-roles';

// Ask YukthiX follow-ups (founder answers 2112 and 2113): a sales request straight from a chat about buying (Plan & add-ons'
// key, once per chat, audited, into the existing sales-assist queue with the chat masked), and feature requests behind a
// console key of their own. 2116 (the console editor's switch) is in console-helpcentre.e2e-spec.ts.
describe('Ask YukthiX follow-ups (2112, 2113)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<'A' | 'B', string> = { A: '', B: '' };
  let planId = '';
  const settingsBefore = new Map<string, string | null>();
  const api = (who: string, method: 'get' | 'post' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who] ?? who}`);
  const sup = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant(SUPER, fn);
  const queue: Record<string, unknown>[] = [];
  const reply = (body: Record<string, unknown>): BetaMessage =>
    ({ id: `msg_${randomUUID()}`, type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(body), citations: null }] }) as unknown as BetaMessage;
  const stub = { create: jest.fn(async () => reply(queue.shift() ?? { answer: 'Not in the help.', sources: [], outcome: 'not_covered' })) };
  const setSetting = (key: string, value: string) => sup((tx) => tx.platformSetting.upsert({ where: { key }, create: { key, value }, update: { value } }));
  const ask = async (who: string, question: string, outcome: string) => {
    queue.push({ answer: outcome === 'buying' ? 'YukthiX sales can help with plans and prices.' : 'Open Leave and press Apply.', sources: [], outcome });
    return (await api(who, 'post', '/help/assistant/ask').send({ question }).expect(200)).body.conversation.id as string;
  };
  const sale = { phone: '98450 12345', topics: ['pricing'], note: 'About 300 people from April.' };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).overrideProvider(ASK_CLIENT).useValue(stub));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    for (const key of ['help.assistant.daily_questions', 'help.assistant.model']) settingsBefore.set(key, (await sup((tx) => tx.platformSetting.findUnique({ where: { key } })))?.value ?? null);
    await setSetting('help.assistant.model', 'claude-opus-5-5');
    await setSetting('help.assistant.daily_questions', '50');
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `askf-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const slug = `askf-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `Buying Foods ${k} ${run}`, slug, planId } })).id;
      const people: [string, string][] = k === 'A' ? [['adminA', 'org_admin'], ['empA', 'panel']] : [['adminB', 'org_admin']];
      for (const [who, role] of people) {
        const email = `${who.toLowerCase()}-${run}@askf.test`;
        users[who] = (await tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org[k], email, name: `Person ${who}`, passwordHash, role } }))).id;
        token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    // Staff: one per role that matters here (the roles' keys are the migrations' fixed sets).
    for (const [who, roles] of [['support', ['support_agent']], ['success', ['customer_success']], ['rules', ['rules_editor']]] as const) {
      const email = `${who}-${run}@platform.test`;
      users[who] = (await sup((tx) => tx.user.create({ data: { email, name: `Staff ${who}`, passwordHash, role: 'super_admin', organizationId: null } }))).id;
      await giveStaffRoles(users[who]!, roles);
      token[who] = (await request(server()).post('/api/v1/auth/platform/login').send({ email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
  }, 180_000);

  afterAll(async () => {
    await sup(async (tx) => {
      const defaults: Record<string, string> = { 'help.assistant.daily_questions': '50', 'help.assistant.model': 'claude-opus-5-5' };
      for (const [key, value] of settingsBefore) await tx.platformSetting.update({ where: { key }, data: { value: value ?? defaults[key]! } });
      const u = Object.values(users);
      await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
      await tx.session.deleteMany({ where: { userId: { in: u } } });
      await tx.organization.deleteMany({ where: { id: { in: Object.values(org) } } });
      await tx.user.deleteMany({ where: { id: { in: u } } });
    }).catch((e: Error) => console.warn(`cleanup: ${e.message}`));
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  describe('2112: a sales request from a chat about buying', () => {
    let conv = '';
    it('whoever manages the plan sees the offer; others do not', async () => {
      expect((await api('adminA', 'get', '/help/assistant').expect(200)).body.canAskSales).toBe(true);
      expect((await api('empA', 'get', '/help/assistant').expect(200)).body.canAskSales).toBe(false);
    });

    it('sends it into the sales-assist queue with the chat (masked) and the phone given; once per chat; audited twice', async () => {
      conv = await ask('adminA', 'How much is the Pro plan for 300 people? Call me on 9876543210.', 'buying');
      await api('adminA', 'post', `/help/assistant/conversations/${conv}/sales-request`).send({ ...sale, phone: '12345' }).expect(400);
      await api('adminA', 'post', `/help/assistant/conversations/${conv}/sales-request`).send({ ...sale, topics: ['discounts'] }).expect(400);
      const out = (await api('adminA', 'post', `/help/assistant/conversations/${conv}/sales-request`).send(sale).expect(201)).body;
      expect(out).toEqual({ number: expect.any(Number), dueAt: expect.any(String) });
      await api('adminA', 'post', `/help/assistant/conversations/${conv}/sales-request`).send(sale).expect(409);
      const state = (await api('adminA', 'get', '/help/assistant').expect(200)).body;
      expect(state.conversation).toMatchObject({ id: conv, salesRequestSent: true });
      // Answer 2146: while it is open, the company sees when sales call, and a second chat cannot send another.
      expect(state.salesOpen).toEqual({ dueAt: out.dueAt });
      const second = await ask('adminA', 'And what about the Enterprise plan?', 'buying');
      expect((await api('adminA', 'post', `/help/assistant/conversations/${second}/sales-request`).send(sale).expect(409)).body.message).toMatch(/already asked YukthiX sales/);
      // Another company is not affected.
      expect((await api('adminB', 'get', '/help/assistant').expect(200)).body.salesOpen).toBeNull();
      const row = await sup((tx) => tx.salesAssistRequest.findFirstOrThrow({ where: { conversationId: conv } }));
      expect(row).toMatchObject({ organizationId: org.A, source: 'assistant', phone: '9845012345', topics: ['pricing'], requestedBy: users.adminA, featureKey: null, status: 'open' });
      expect(row.chat).toContain('How much is the Pro plan');
      expect(row.chat).not.toContain('9876543210');
      const company = await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) => tx.auditLog.findMany({ where: { entityId: row.id }, select: { action: true, actorUserId: true } }));
      expect(company).toEqual([{ action: 'help.assistant.sales_requested', actorUserId: users.adminA }]);
      expect(await sup((tx) => tx.auditLog.count({ where: { entityId: row.id, action: 'platform.sales.requested' } }))).toBe(1);
    });

    it('staff with the sales key see it in the queue as an Ask YukthiX request, with the chat', async () => {
      const q = (await api('success', 'get', '/platform/sales').expect(200)).body;
      const mine = q.rows.find((r: { company: string }) => r.company === `Buying Foods A ${run}`);
      expect(mine).toMatchObject({ why: 'Ask YukthiX: a buying question · pricing for their size', phone: '9845012345', note: sale.note });
      expect(mine.chat).toContain('[phone hidden]');
      await api('rules', 'get', '/platform/sales').expect(403);
    });

    it('negative: not about buying, someone else’s chat, no plan key, or acting for someone else are refused', async () => {
      const leave = await ask('adminA', 'How do I apply for leave?', 'answered');
      expect((await api('adminA', 'post', `/help/assistant/conversations/${leave}/sales-request`).send(sale).expect(409)).body.message).toMatch(/about buying/);
      const emp = await ask('empA', 'What does the Pro plan cost?', 'buying');
      await api('empA', 'post', `/help/assistant/conversations/${emp}/sales-request`).send(sale).expect(403);
      await api('adminA', 'post', `/help/assistant/conversations/${emp}/sales-request`).send(sale).expect(404);
      await api('adminB', 'post', `/help/assistant/conversations/${conv}/sales-request`).send(sale).expect(404);
      await markSteppedUp(tenantPrisma, token.adminA!);
      const acting = (await api('adminA', 'post', `/auth/impersonate/${users.empA}`).expect(200)).body.accessToken as string;
      await api(acting, 'post', `/help/assistant/conversations/${emp}/sales-request`).send(sale).expect(403);
      expect(await sup((tx) => tx.salesAssistRequest.count({ where: { organizationId: { in: [org.A, org.B] } } }))).toBe(1);
    });

    // Answer 2135: one open chat sales request per company at a time.
    it('a second chat about buying waits while the company has one open; once it is decided, a new one goes', async () => {
      const second = await ask('adminA', 'And the price of the Enterprise plan?', 'buying');
      expect((await api('adminA', 'post', `/help/assistant/conversations/${second}/sales-request`).send(sale).expect(409)).body.message).toMatch(/already asked YukthiX sales from a chat\. They reply by/);
      expect((await api('adminA', 'get', '/help/assistant').expect(200)).body.conversation).toMatchObject({ id: second, salesRequestSent: false });
      await sup((tx) => tx.salesAssistRequest.updateMany({ where: { organizationId: org.A, source: 'assistant' }, data: { status: 'demo_booked', ownerId: users.success, decidedAt: new Date() } }));
      await api('adminA', 'post', `/help/assistant/conversations/${second}/sales-request`).send(sale).expect(201);
      // Another company is never held back by this one.
      const b = await ask('adminB', 'What does the Pro plan cost?', 'buying');
      await api('adminB', 'post', `/help/assistant/conversations/${b}/sales-request`).send(sale).expect(201);
    });
  });

  describe('2113: feature requests have a console key of their own', () => {
    it('Support agent and Customer success hold it; the other roles do not; no company role can', async () => {
      expect(await rolesWithout('platform.feature_requests.manage')).toEqual(['rules_editor', 'finance', 'security_lead']);
      expect(KEY_WORDS['platform.feature_requests.manage']).toBe('Decide the feature requests sent from Ask YukthiX');
      await api('adminA', 'get', '/platform/feature-requests').expect(403);
    });

    it('with the key: the list and the review; without it: neither', async () => {
      for (const who of ['support', 'success']) {
        await api(who, 'get', '/platform/feature-requests').expect(200);
        await api(who, 'get', '/platform/assistant/review?days=1').expect(200);
      }
      await api('rules', 'get', '/platform/feature-requests').expect(403);
      await api('rules', 'put', `/platform/feature-requests/${randomUUID()}`).send({ status: 'planned', version: 1 }).expect(403);
      await api('rules', 'get', '/platform/assistant/review?days=1').expect(403);
    });

    it('a customer-success member (no help-centre key) decides a request; it is audited with them', async () => {
      const c = await ask('empA', 'Can YukthiX export payslips to Tally?', 'feature_request');
      await api('empA', 'post', `/help/assistant/conversations/${c}/feature-request`).send({ title: `Tally export ${run}` }).expect(201);
      const row = ((await api('success', 'get', '/platform/feature-requests').expect(200)).body as { id: string; title: string; version: number }[]).find((r) => r.title === `Tally export ${run}`)!;
      await api('success', 'put', `/platform/feature-requests/${row.id}`).send({ status: 'planned', version: row.version }).expect(200);
      expect(await sup((tx) => tx.auditLog.count({ where: { entityId: row.id, actorUserId: users.success } }))).toBeGreaterThan(0);
    });
  });
});
