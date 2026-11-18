import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantContext, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { DripMigration } from '../src/drip/drip-migration';

// Retire /v2 (answers 2433, 2512, 2513): each drip campaign becomes a draft HIR-20 campaign once, with nobody moved
// into its pool; active drip enrolments end; the drip routes are gone; one company never touches another.
describe('Drip campaigns move into HIR-20 campaigns', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const SUPER: TenantContext = { organizationId: null, isSuperAdmin: true };
  const server = () => app.getHttpServer();
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const token: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const at = <T>(k: 'A' | 'B', fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k].id, isSuperAdmin: false }, fn);
  const migrate = () => app.get(DripMigration).run();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `drip-plan-${run}`, candidateLimit: 100, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const passwordHash = await argon2.hash(PASSWORD);
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Drip ${k}`, slug: `drip-${k.toLowerCase()}-${run}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      await at(k, (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `admin@drip-${k.toLowerCase()}-${run}.test`, name: `Admin ${k}`, passwordHash, role: 'org_admin' } }));
      token[k] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `admin@drip-${k.toLowerCase()}-${run}.test`, password: PASSWORD }).expect(200)).body.accessToken;
      const steps = [{ subject: `Hello {{candidateName}} ${k}`, body: 'We are hiring.', delayDays: 0 }, { subject: 'Still interested?', body: 'Reply to us.', delayDays: 7 }];
      const d = await at(k, (tx) => tx.dripCampaign.create({ data: { organizationId: org[k].id, name: `Nurture ${k} ${run}`, enabled: true, targetGlobalStage: k === 'A' ? 'available' : null, stepsJson: JSON.stringify(steps) } }));
      ids[`drip${k}`] = d.id;
      await at(k, (tx) => tx.dripEnrolment.create({ data: { organizationId: org[k].id, campaignId: d.id, candidateId: randomUUID(), entryId: randomUUID(), nextStepDueAt: new Date() } }));
    }
  }, 300_000);

  afterAll(async () => {
    await tenantPrisma.forTenant(SUPER, async (tx) => {
      for (const k of ['A', 'B'] as const) await tx.organization.delete({ where: { id: org[k].id } }).catch(() => undefined);
    });
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('each drip becomes a draft email campaign with its own templates, waits and an empty pool; the drip is off', async () => {
    await migrate();
    const drip = await at('A', (tx) => tx.dripCampaign.findFirstOrThrow({ where: { id: ids.dripA } }));
    expect(drip.enabled).toBe(false);
    expect(drip.migratedCampaignId).toBeTruthy();
    const camp = await at('A', (tx) => tx.talentCampaign.findFirstOrThrow({ where: { id: drip.migratedCampaignId! } }));
    expect(camp).toMatchObject({ status: 'draft', channel: 'email', name: `Nurture A ${run} (from drip)` });
    const steps = camp.steps as { kind: string; templateId?: string; days?: number }[];
    expect(steps.map((s) => s.kind)).toEqual(['message', 'wait', 'message']);
    expect(steps[1].days).toBe(7);
    const t = await at('A', (tx) => tx.candidateEmailTemplate.findFirstOrThrow({ where: { id: steps[0].templateId! } }));
    expect(t).toMatchObject({ subject: `Hello {{candidateName}} A`, body: 'We are hiring.', enabled: true });
    const pool = await at('A', (tx) => tx.talentPool.findFirstOrThrow({ where: { id: camp.poolId }, include: { members: true } }));
    expect(pool.members).toHaveLength(0);
    expect(pool.description).toContain('"available" stage');
    const enrol = await at('A', (tx) => tx.dripEnrolment.findFirstOrThrow({ where: { campaignId: ids.dripA } }));
    expect(enrol).toMatchObject({ status: 'exited', exitReason: 'migrated' });
    expect(await at('A', (tx) => tx.talentCampaignMember.count({ where: { campaignId: camp.id } }))).toBe(0);
    expect(await at('A', (tx) => tx.auditLog.count({ where: { organizationId: org.A.id, action: 'drip_campaign.migrated', entityId: ids.dripA } }))).toBe(1);
  });

  it('running it again changes nothing', async () => {
    const before = await at('A', (tx) => Promise.all([tx.talentCampaign.count(), tx.talentPool.count(), tx.candidateEmailTemplate.count()]));
    expect(await migrate()).toBe(0);
    expect(await at('A', (tx) => Promise.all([tx.talentCampaign.count(), tx.talentPool.count(), tx.candidateEmailTemplate.count()]))).toEqual(before);
  });

  it("each company sees only its own moved campaign", async () => {
    const dripB = await at('B', (tx) => tx.dripCampaign.findFirstOrThrow({ where: { id: ids.dripB } }));
    expect(await at('A', (tx) => tx.talentCampaign.count({ where: { id: dripB.migratedCampaignId! } }))).toBe(0);
    expect(await at('B', (tx) => tx.talentCampaign.count({ where: { id: dripB.migratedCampaignId! } }))).toBe(1);
    expect(await at('B', (tx) => tx.talentPool.count({ where: { name: { startsWith: `From drip: Nurture A` } } }))).toBe(0);
  });

  it('the drip routes are gone', async () => {
    await request(server()).get('/api/v1/drip-campaigns').set('Authorization', `Bearer ${token.A}`).expect(404);
    await request(server()).post('/api/v1/drip-campaigns').set('Authorization', `Bearer ${token.A}`).send({ name: 'x', steps: [] }).expect(404);
  });
});
