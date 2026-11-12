import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-7 (answers 1321, 1484, 1521), against the real database. The settings from Company rules, Access and privacy
// and Payroll rules moved to drawn pages; storage is unchanged, so a value of its own for one entity reads the same before
// and after a save on the new page; the bonus and loan settings now wait for a second person.
describe('Settings S-7: moved settings keep their values; bonus and loan rules need a second person', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  let orgId = '';
  let planId = '';
  let entity = '';
  let grade = '';
  const api = (who: string, method: 'get' | 'put' | 'post', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' });
  const inOrg = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
  const valueOf = async (key: string) => (await inOrg((tx) => tx.setting.findFirst({ where: { organizationId: orgId, key, scopeType: 'tenant' } })))?.value ?? null;
  const audits = (action: string) => inOrg(async (tx) => (await tx.auditLog.findMany({ where: { organizationId: orgId, action } })).map((a) => ({ actor: a.actorUserId, meta: JSON.parse(a.metadataJson ?? '{}') as Record<string, unknown> })));

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s7-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `s7-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `S7 ${run}`, slug, planId } })).id;
    const people: [string, string[]][] = [
      ['hr1', ['org.settings.manage', 'org.structure.view', 'access.role.manage']],
      ['hr2', ['org.settings.manage', 'org.structure.view']],
      ['hr3', ['org.settings.manage', 'access.role.manage']],
      ['payroll', ['payroll.setup.manage', 'payroll.run.view']],
      ['plain', []],
    ];
    for (const [who, keys] of people) {
      const permissionProfileId = (await inOrg((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
      const email = `${who}-${run}@s7.test`;
      users[who] = (await inOrg((tx) => tx.user.create({ data: { organizationId: orgId, email, name: `Person ${who}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
    entity = (await inOrg((tx) => tx.legalEntity.create({ data: { organizationId: orgId, name: 'Kaveri Foods', shortName: 'KFPL', isDefault: true } }))).id;
    grade = (await inOrg((tx) => tx.grade.create({ data: { organizationId: orgId, name: 'G5', code: 'G5', rank: 5 } }))).id;
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.organization.deleteMany({ where: { id: orgId } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  type Override = { key: string; scopeType: string; scopeId: string; value: unknown };
  const overrides = async (key: string) => ((await api('hr2', 'get', '/org/settings').expect(200)).body.overrides as Override[]).filter((o) => o.key === key).map(({ key: k, scopeType, scopeId, value }) => ({ key: k, scopeType, scopeId, value }));

  it('a per-entity value set before the move reads the same after a company change on the new page (before-and-after read)', async () => {
    await api('hr2', 'put', '/org/settings').send({ key: 'work.normal_week_hours', value: '48', scopeType: 'legal_entity', scopeId: entity }).expect(200);
    const before = await overrides('work.normal_week_hours');
    expect(before).toEqual([{ key: 'work.normal_week_hours', scopeType: 'legal_entity', scopeId: entity, value: '48' }]);
    await put('hr2', 'work.normal_week_hours', '40').expect(200);
    const after = await overrides('work.normal_week_hours');
    expect(after.filter((o) => o.scopeType === 'legal_entity')).toEqual(before);
    expect(after.find((o) => o.scopeType === 'tenant')).toMatchObject({ value: '40' });
  });

  it('negative: a setting that may not differ by entity refuses a value of its own there', async () => {
    const r = await api('hr2', 'put', '/org/settings').send({ key: 'policy.ack.due_days', value: '30', scopeType: 'legal_entity', scopeId: entity });
    expect(r.status).toBe(400);
    expect(await overrides('policy.ack.due_days')).toEqual([]);
  });

  it('the retirement age may be set for one grade (answer 1564); negative: the exit notice months may not', async () => {
    await api('hr2', 'put', '/org/settings').send({ key: 'retirement.age', value: '60', scopeType: 'grade', scopeId: grade }).expect(200);
    expect(await overrides('retirement.age')).toEqual([{ key: 'retirement.age', scopeType: 'grade', scopeId: grade, value: '60' }]);
    expect((await api('hr2', 'put', '/org/settings').send({ key: 'retirement.alert_months', value: '3', scopeType: 'grade', scopeId: grade })).status).toBe(400);
    expect(await overrides('retirement.alert_months')).toEqual([]);
  });

  it('a loan limit change (4.6) waits for a second person; the person who asked cannot approve it; another HR person does', async () => {
    const r = (await put('hr1', 'payroll.loan.max_gross_months', '3').expect(200)).body;
    expect(r).toMatchObject({ pending: true, key: 'payroll.loan.max_gross_months' });
    expect(await valueOf('payroll.loan.max_gross_months')).toBeNull();
    const id = ((await api('hr2', 'get', '/org/settings').expect(200)).body.pending as { id: string; key: string }[]).find((p) => p.key === 'payroll.loan.max_gross_months')!.id;
    expect((await api('hr1', 'post', `/org/settings/requests/${id}/approve`).send({}).expect(403)).body.message).toMatch(/another person/);
    await api('hr2', 'post', `/org/settings/requests/${id}/approve`).send({}).expect(200);
    expect(await valueOf('payroll.loan.max_gross_months')).toBe('3');
  });

  it('a bonus setting also waits; with the switch off it saves at once', async () => {
    expect((await put('hr1', 'payroll.bonus.min_rate', '8.33').expect(200)).body).toMatchObject({ pending: true });
    const off = (await put('hr1', 'payroll.settings.second_person', 'off').expect(200)).body;
    await api('hr3', 'post', `/org/settings/requests/${off.id}/approve`).send({}).expect(200);
    expect((await put('hr1', 'payroll.reports_access.days', '30').expect(200)).body.pending).toBeFalsy();
    expect(await valueOf('payroll.reports_access.days')).toBe('30');
  });
});
