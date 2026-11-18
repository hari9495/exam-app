import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';

// Retiring /v2 (answers 2420-2438), the settings that moved into YukthiX Settings, against the real database (forced
// RLS, app role): positive and negative per gap.
describe('Retired /v2 settings in YukthiX Settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  const stage: Record<string, string> = {};
  let planId = '';
  const call = (who: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string) => request(app.getHttpServer())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = <T>(k: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `rv2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `rv2-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `RV2 ${k} ${run}`, slug, planId } })).id;
      for (const [who, role] of (k === 'A' ? [['admin', 'org_admin'], ['plain', 'panel']] : [['admin', 'org_admin']]) as [string, string][]) {
        const email = `${who}-${k.toLowerCase()}-${run}@rv2.test`;
        users[`${who}${k}`] = (await at(k, (tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k}`, passwordHash, role } }))).id;
        token[`${who}${k}`] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
      stage[k] = await at(k, async (tx) => {
        const p = await tx.pipeline.create({ data: { organizationId: org[k]!, name: 'Standard', isDefault: true } });
        return (await tx.pipelineStage.create({ data: { organizationId: org[k]!, pipelineId: p.id, name: 'interview', category: 'active', position: 1 } })).id;
      });
    }
    token.acting = (await call('adminA', 'post', `/auth/impersonate/${users.plainA}`).expect(200)).body.accessToken;
  }, 180_000);

  afterAll(async () => {
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  // Answer 2434: the stage message templates on 6.1 Hiring.
  describe('6.1 stage message templates (2434)', () => {
    it('lists the standard wording, saves the company copy for a stage and audits before and after', async () => {
      const list = (await call('adminA', 'get', '/candidate-sms-templates').expect(200)).body as { id: string | null; name: string; triggerStageId: string | null }[];
      expect(list).toContainEqual(expect.objectContaining({ id: null, name: 'Moving to interview', triggerStageId: stage.A }));
      const made = (await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'Interview', triggerStageId: stage.A, triggerMode: 'auto', body: 'Hi {{candidateName}}', enabled: true }).expect(201)).body;
      await call('adminA', 'patch', `/candidate-sms-templates/${made.id}`).send({ name: 'Interview call', triggerStageId: stage.A, triggerMode: 'prompt', body: 'Hi', enabled: false }).expect(200);
      const logs = await at('A', (tx) => tx.auditLog.findMany({ where: { action: 'candidate_sms_template.saved', entityId: made.id }, orderBy: { createdAt: 'asc' } }));
      expect(logs.map((l) => JSON.parse(l.metadataJson ?? '{}'))).toEqual([
        expect.objectContaining({ before: null, after: expect.objectContaining({ name: 'Interview', triggerMode: 'auto', enabled: true }) }),
        expect.objectContaining({ before: expect.objectContaining({ name: 'Interview', triggerMode: 'auto' }), after: expect.objectContaining({ name: 'Interview call', triggerMode: 'prompt', enabled: false }) }),
      ]);
      // A repeat for the same stage updates the one row (no duplicate).
      await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'Interview again', triggerStageId: stage.A, triggerMode: 'manual', body: 'Hi' }).expect(201);
      expect(await at('A', (tx) => tx.candidateSmsTemplate.count({ where: { triggerStageId: stage.A } }))).toBe(1);
      // Email and WhatsApp the same way.
      await call('adminA', 'post', '/candidate-email-templates').send({ name: 'Welcome', triggerStageId: null, triggerMode: 'manual', subject: 'Hello', body: 'Hi' }).expect(201);
      await call('adminA', 'post', '/candidate-whatsapp-templates').send({ name: 'Nudge', triggerStageId: stage.A, triggerMode: 'prompt', body: 'Hi' }).expect(201);
    });

    it('negative: another company’s stage, bad input, no pipeline key, acting for someone else, another company’s template', async () => {
      await call('adminA', 'post', '/candidate-email-templates').send({ name: 'X', triggerStageId: stage.B, triggerMode: 'auto', subject: 'S', body: 'B' }).expect(400);
      await call('adminA', 'post', '/candidate-whatsapp-templates').send({ name: 'X', triggerStageId: randomUUID(), triggerMode: 'auto', body: 'B' }).expect(400);
      await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'sometimes', body: 'B' }).expect(400);
      await call('adminA', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'manual', body: 'x'.repeat(1601) }).expect(400);
      await call('plainA', 'get', '/candidate-sms-templates').expect(403);
      await call('plainA', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'manual', body: 'B' }).expect(403);
      await call('acting', 'post', '/candidate-sms-templates').send({ name: 'X', triggerStageId: null, triggerMode: 'manual', body: 'B' }).expect(403);
      const mine = await at('A', (tx) => tx.candidateSmsTemplate.findFirstOrThrow({ where: { triggerStageId: stage.A } }));
      await call('adminB', 'patch', `/candidate-sms-templates/${mine.id}`).send({ name: 'Taken', triggerStageId: null, triggerMode: 'manual', body: 'B' }).expect(404);
      await call('adminB', 'delete', `/candidate-sms-templates/${mine.id}`).expect(404);
      expect((await call('adminB', 'get', '/candidate-sms-templates').expect(200)).body.some((t: { id: string | null }) => t.id === mine.id)).toBe(false);
      expect(await at('A', (tx) => tx.candidateEmailTemplate.count({ where: { triggerStageId: stage.B } }))).toBe(0);
    });
  });
});
