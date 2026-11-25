import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { AutomationService, type RecordTypeHandler } from '../src/rules-engine/automation.service';

// Founder answer 2092: with more than one API server, two rule runners could pass a rule's hourly-limit check at the same
// moment and both run. The limit check and the run now hold a per-rule lock (a Postgres advisory lock for the run's
// transaction). Real database, real engine; a record type of the test's own whose action takes a moment, so the runners
// overlap for certain.
describe('Rule lock: the hourly limit holds with runners in parallel (2092)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let automation: AutomationService;
  let planId: string;
  let org: string;
  const run = randomUUID().slice(0, 8);
  const RECORD_TYPE = 'locktest.thing';
  let executed = 0;
  const told: string[] = [];
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // A record type of the test's own: every record matches; the action takes 400 ms inside the run's transaction.
  const handler: RecordTypeHandler = {
    key: RECORD_TYPE,
    module: 'locktest',
    triggers: [{ key: 'created', label: 'Created' }] as never,
    fields: async () => [],
    fromEvent: () => null,
    system: async () => undefined,
    load: async () => ({ values: {}, scopeId: null, hide: false, label: 'thing' }),
    parseAction: async () => ({ type: 'slow' }) as never,
    execute: async () => {
      executed++;
      await sleep(400);
      return 'Done';
    },
    timeCandidates: async () => [],
    recent: async () => [],
    webhookBody: () => ({}),
    tellAdmins: async (_o, _s, ruleId, _n, why) => void told.push(`${ruleId}:${why}`),
  };
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: false }, fn);
  const makeRule = (maxRunsPerHour: number) =>
    inOrg(async (tx) => {
      const r = await tx.rule.create({ data: { organizationId: org, ownerModule: 'locktest', recordType: RECORD_TYPE, name: `Lock ${maxRunsPerHour} ${randomUUID().slice(0, 4)}`, status: 'active', maxRunsPerHour } });
      await tx.ruleVersion.create({ data: { organizationId: org, ruleId: r.id, version: 1, trigger: { type: 'created' }, condition: { id: 'g', join: 'and', items: [] }, actions: [{ type: 'slow' }] } });
      return r.id;
    });
  // Each runner is a separate call, as two API servers would make: its own record, its own chain.
  const runners = (n: number) => Promise.all(Array.from({ length: n }, () => automation.fire({ organizationId: org, isSuperAdmin: false }, handler, randomUUID(), 'created', [], { id: randomUUID(), depth: 0, fired: [] })));
  const outcomes = (ruleId: string) => inOrg((tx) => tx.automationRun.findMany({ where: { ruleId }, select: { outcome: true } })).then((r) => r.map((x) => x.outcome).sort());
  const ruleNow = (ruleId: string) => inOrg((tx) => tx.rule.findFirstOrThrow({ where: { id: ruleId }, select: { status: true, pausedReason: true } }));

  beforeAll(async () => {
    app = await bootAdminApp();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    automation = app.get(AutomationService);
    planId = (await prisma.plan.create({ data: { name: `rule-lock-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    org = (await prisma.organization.create({ data: { name: `Rule lock ${run}`, slug: `rule-lock-${run}`, planId } })).id;
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma.forTenant({ organizationId: org, isSuperAdmin: true }, async (tx) => {
      await tx.automationRun.deleteMany({ where: { organizationId: org } });
      await tx.ruleVersion.deleteMany({ where: { organizationId: org } });
      await tx.rule.deleteMany({ where: { organizationId: org } });
    }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: org } }).catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('two runners at once on a rule with a limit of 1: one runs, the other stops at the limit, the rule pauses once', async () => {
    const ruleId = await makeRule(1);
    executed = 0;
    const [a, b] = await runners(2);
    expect(a + b).toBe(1);
    expect(executed).toBe(1);
    expect(await outcomes(ruleId)).toEqual(['limit_stopped', 'matched']);
    expect(await ruleNow(ruleId)).toEqual({ status: 'paused', pausedReason: 'Paused: it ran 1 times in an hour, its limit' });
    expect(told.filter((t) => t.startsWith(ruleId))).toHaveLength(1);
    expect(await inOrg((tx) => tx.auditLog.count({ where: { entityId: ruleId, action: 'rule.paused_at_limit' } }))).toBe(1);
  });

  it('six runners at once on a limit of 3: exactly 3 runs, never more', async () => {
    const ruleId = await makeRule(3);
    executed = 0;
    const results = await runners(6);
    expect(results.reduce((x, y) => x + y, 0)).toBe(3);
    expect(executed).toBe(3);
    const out = await outcomes(ruleId);
    expect(out.filter((o) => o === 'matched')).toHaveLength(3);
    expect(out.filter((o) => o === 'limit_stopped')).toHaveLength(3);
    expect((await ruleNow(ruleId)).status).toBe('paused');
  });

  it('negative: under the limit the lock only queues runners, it never stops one (limit 5, three at once)', async () => {
    const ruleId = await makeRule(5);
    executed = 0;
    const results = await runners(3);
    expect(results).toEqual([1, 1, 1]);
    expect(await outcomes(ruleId)).toEqual(['matched', 'matched', 'matched']);
    expect((await ruleNow(ruleId)).status).toBe('active');
    // Out of the way of the next test (every active rule of the record type fires for each record).
    await inOrg((tx) => tx.rule.update({ where: { id: ruleId }, data: { status: 'retired' } }));
  });

  it('negative: another rule is never held by this rule’s lock (both limits of 1 run together, one run each)', async () => {
    const [r1, r2] = [await makeRule(1), await makeRule(1)];
    executed = 0;
    const started = Date.now();
    const total = await runners(1);
    // Both active rules of the record type fire for the one record; each runs once and neither stops the other.
    expect(total).toEqual([2]);
    expect(await outcomes(r1)).toEqual(['matched']);
    expect(await outcomes(r2)).toEqual(['matched']);
    expect(Date.now() - started).toBeLessThan(10_000);
    await inOrg((tx) => tx.rule.updateMany({ where: { id: { in: [r1, r2] } }, data: { status: 'retired' } }));
  });
});
