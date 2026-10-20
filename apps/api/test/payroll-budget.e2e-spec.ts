import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { todayIst } from '../src/org-structure/org-validation';

// Payroll budget (founder decision 21 Oct 2026): set month by month per legal entity with payroll.setup.manage, every
// change audited; read by whoever sees the entity's runs; the finance Home draws cost against it. Never across companies.
describe('Payroll budget', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const month = todayIst().slice(0, 7);
  const y = Number(month.slice(0, 4)) - (Number(month.slice(5, 7)) < 4 ? 1 : 0);
  const taxYear = `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  type Who = 'setupA' | 'approverA' | 'plainA' | 'setupB';
  const ids: Record<string, string> = {};
  const ctx = (k: 'A' | 'B') => ({ organizationId: org[k].id, isSuperAdmin: false });
  const api = (who: Who, method: 'get' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const read = (who: Who, entity: string) => api(who, 'get', `/payroll/budgets?entityId=${entity}&taxYear=${taxYear}`);
  const save = (who: Who, entity: string, months: { month: string; amount: string | null }[]) => api(who, 'put', '/payroll/budgets').send({ legalEntityId: entity, months });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue({ send: jest.fn().mockResolvedValue({ success: true }) }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    planId = (await prisma.plan.create({ data: { name: `budget-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `Budget ${k}`, slug: `budget-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
      ids[`le${k}`] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.legalEntity.create({ data: { organizationId: org[k].id, name: `Entity ${k}`, shortName: `B${k}${runId}`, isDefault: true } }))).id;
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const roster: [Who, 'A' | 'B', string[] | null][] = [
      ['setupA', 'A', ['payroll.setup.manage', 'payroll.run.view']],
      ['approverA', 'A', ['payroll.run.approve']],
      ['plainA', 'A', null],
      ['setupB', 'B', ['payroll.setup.manage', 'payroll.run.view']],
    ];
    for (const [name, k, keys] of roster) {
      const permissionProfileId = keys ? (await tenantPrisma.forTenant(ctx(k), (tx) => tx.permissionProfile.create({ data: { organizationId: org[k].id, name: `${name}-${runId}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[name] = (await tenantPrisma.forTenant(ctx(k), (tx) => tx.user.create({ data: { organizationId: org[k].id, email: `${name}-${runId}@budget.test`, name: `${name} Person`, passwordHash, role: 'panel', permissionProfileId } }))).id;
      token[name] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org[k].slug, email: `${name}-${runId}@budget.test`, password: PASSWORD }).expect(200)).body.accessToken;
    }
    // This month's payroll of company A, as the run stores it: cost to company in the totals.
    await tenantPrisma.forTenant(ctx('A'), async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leA}}`}, true)`;
      const group = await tx.payGroup.create({ data: { organizationId: org.A.id, legalEntityId: ids.leA, name: 'Monthly' } });
      await tx.payrollRun.create({ data: { organizationId: org.A.id, legalEntityId: ids.leA, payGroupId: group.id, periodStart: new Date(`${month}-01T00:00:00Z`), periodEnd: new Date(`${month}-28T00:00:00Z`), status: 'calculated', preparedBy: users.setupA, totals: { people: 2, net: '150000.00', employerCost: '215600.50' } } });
    });
  }, 180_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A.id, org.B.id] } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('payroll set-up sets and clears months, each change audited with the old and new amount', async () => {
    expect((await save('setupA', ids.leA, [{ month, amount: '214000.00' }]).expect(200)).body).toEqual({ changed: 1 });
    expect((await save('setupA', ids.leA, [{ month, amount: '214000' }]).expect(200)).body).toEqual({ changed: 0 });
    await save('setupA', ids.leA, [{ month, amount: '220000.50' }]).expect(200);
    const body = (await read('setupA', ids.leA).expect(200)).body;
    expect(body.canEdit).toBe(true);
    expect(body.months).toHaveLength(12);
    expect(body.months.find((m: { month: string }) => m.month === month)).toMatchObject({ budget: '220000.50', cost: '215600.50', changedBy: 'setupA Person' });
    const trail = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: 'payroll.budget.' } }, orderBy: { createdAt: 'asc' } }));
    const meta = (a: { metadataJson: string | null }) => JSON.parse(a.metadataJson ?? '{}') as { from: string | null; to?: string; month: string };
    expect(trail.map((a) => [a.action, meta(a).from, meta(a).to])).toEqual([
      ['payroll.budget.set', null, '214000.00'],
      ['payroll.budget.set', '214000.00', '220000.50'],
    ]);
  });

  it('someone who sees the runs reads it but cannot change it; no pay key reads nothing; bad amounts are refused', async () => {
    expect((await read('approverA', ids.leA).expect(200)).body).toMatchObject({ canEdit: false });
    await save('approverA', ids.leA, [{ month, amount: '1' }]).expect(403);
    await read('plainA', ids.leA).expect(403);
    expect((await api('approverA', 'get', '/payroll/budgets/entities').expect(200)).body).toEqual([{ id: ids.leA, name: 'Entity A', shortName: `BA${runId}`, keys: [] }]);
    expect((await api('setupA', 'get', '/payroll/budgets/entities').expect(200)).body).toMatchObject([{ id: ids.leA, keys: ['payroll.setup.manage'] }]);
    expect((await api('setupB', 'get', '/payroll/budgets/entities').expect(200)).body.map((e: { id: string }) => e.id)).toEqual([ids.leB]);
    await save('setupA', ids.leA, [{ month, amount: '-5' }]).expect(400);
    await save('setupA', ids.leA, [{ month: '2026-13', amount: '5' }]).expect(400);
  });

  it("never reads or writes another company's budget", async () => {
    await read('setupB', ids.leA).expect(404);
    await save('setupB', ids.leA, [{ month, amount: '1' }]).expect(404);
    const own = (await read('setupB', ids.leB).expect(200)).body;
    expect(own.months.every((m: { budget: string | null; cost: string | null }) => m.budget === null && m.cost === null)).toBe(true);
    const rows = await tenantPrisma.forTenant(ctx('B'), async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.pay_entities', ${`{${ids.leA},${ids.leB}}`}, true)`;
      return tx.payrollBudget.count();
    });
    expect(rows).toBe(0);
  });

  it('the finance Home draws the cost against the budget, with the budget link only for set-up', async () => {
    const home = async (who: Who) => (await api(who, 'get', `/workspace/home?month=${month}`).expect(200)).body.finance;
    const a = await home('setupA');
    expect(a.cost.canSetBudget).toBe(true);
    expect(a.cost.months).toHaveLength(6);
    expect(a.cost.months[5]).toEqual({ month, cost: '215600.50', budget: '220000.50' });
    expect((await home('approverA')).cost.canSetBudget).toBe(false);
    expect(await home('plainA')).toBeUndefined();
    expect(JSON.stringify(await home('setupB'))).not.toMatch(/215600|220000/);
    // Cleared: the month has cost and no budget again.
    await save('setupA', ids.leA, [{ month, amount: null }]).expect(200);
    expect((await home('setupA')).cost.months[5]).toEqual({ month, cost: '215600.50', budget: null });
    const last = await tenantPrisma.forTenant(ctx('A'), (tx) => tx.auditLog.findFirst({ where: { organizationId: org.A.id, action: 'payroll.budget.cleared' } }));
    expect(JSON.parse(last?.metadataJson ?? '{}')).toMatchObject({ month, from: '220000.50' });
  });
});
