import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-2 (founder answers 1323, 1324), against the real database. The Time & Leave settings that had no screen are
// listed with their starter values; the legal limits come from the country's rule set (IN.SETTINGS.LIMITS); a value past
// the limit is refused naming the Act, the limit itself and anything more generous are saved and audited; someone
// without HR's settings key is refused.
describe('Settings S-2: Time & Leave settings and legal limits (1323, 1324)', () => {
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
  const api = (who: string, method: 'get' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' });

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s2-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slug = `s2-${run}`;
    orgId = (await prisma.organization.create({ data: { name: `S2 ${run}`, slug, planId } })).id;
    const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, fn);
    const people: [string, string, string[] | null][] = [['hr', 'panel', ['org.settings.manage', 'org.structure.view']], ['time', 'panel', ['leave.settings.manage', 'leave.view']], ['plain', 'panel', []]];
    for (const [who, role, keys] of people) {
      const permissionProfileId = keys ? (await at((tx) => tx.permissionProfile.create({ data: { organizationId: orgId, name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      const email = `${who}-${run}@s2.test`;
      users[who] = (await at((tx) => tx.user.create({ data: { organizationId: orgId, email, name: who, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      await markSteppedUp(tenantPrisma, token[who]!);
    }
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

  it('every hidden Time & Leave setting is listed with its starter value, and the legal limits name the Act', async () => {
    const body = (await api('hr', 'get', '/org/settings').expect(200)).body as { registry: Record<string, { default: string }>; limits: Record<string, { max?: number; min?: number; act: string }> };
    for (const key of ['leave.year_start_month', 'leave.comp_off.expiry_days', 'attendance.late_mark_penalty', 'roster.max_weekly_hours', 'kiosk.pin_tries', 'field.ping_minutes', 'timesheet.tool_suggestions']) expect([key, body.registry[key]?.default]).toEqual([key, expect.any(String)]);
    expect(body.limits['roster.max_weekly_hours']).toEqual({ max: 48, act: 'Factories Act, 1948 s.51' });
    expect(body.limits['roster.min_weekly_offs']).toEqual({ min: 1, act: 'Factories Act, 1948 s.52' });
  });

  it('a value past the legal limit is refused, naming the Act; nothing is saved', async () => {
    expect((await put('hr', 'roster.max_weekly_hours', '54').expect(400)).body.message).toBe('Most hours of shifts in a week can be at most 48 by law (Factories Act, 1948 s.51). Choose 48 or less.');
    expect((await put('hr', 'roster.min_weekly_offs', '0').expect(400)).body.message).toMatch(/at least 1 by law \(Factories Act, 1948 s\.52\)/);
    expect((await put('hr', 'roster.max_spread_over_hours', '12').expect(400)).body.message).toMatch(/Factories Act, 1948 s\.56/);
    expect(await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.setting.count({ where: { organizationId: orgId, key: { in: ['roster.max_weekly_hours', 'roster.min_weekly_offs', 'roster.max_spread_over_hours'] } } }))).toBe(0);
  });

  it('the limit itself and a more generous value are saved and audited with before and after', async () => {
    await put('hr', 'roster.max_weekly_hours', '48').expect(200);
    await put('hr', 'roster.max_weekly_hours', '45').expect(200);
    await put('hr', 'roster.min_weekly_offs', '2').expect(200);
    await put('hr', 'leave.comp_off.expiry_days', '90').expect(200);
    const audits = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.auditLog.findMany({ where: { organizationId: orgId, action: 'org.setting.changed' }, orderBy: { createdAt: 'asc' } }));
    const meta = audits.map((a) => JSON.parse(a.metadataJson ?? '{}') as { key: string; from: unknown; to: string });
    expect(meta.filter((m) => m.key === 'roster.max_weekly_hours').map((m) => [m.from, m.to])).toEqual([[null, '48'], ['48', '45']]);
    expect(audits.every((a) => a.actorUserId === users.hr)).toBe(true);
    expect(meta.find((m) => m.key === 'leave.comp_off.expiry_days')).toMatchObject({ to: '90' });
  });

  // Answer 1485: HR's leave admins change the leave pages' settings; attendance and roster limits stay with HR's settings key.
  it('a leave admin saves Leave year (audited as them) but not Weekly offs', async () => {
    await api('time', 'get', '/org/settings').expect(200);
    await put('time', 'leave.year_start_month', '4').expect(200);
    await put('time', 'leave.block_dates.mode', 'warn').expect(200);
    expect((await put('time', 'roster.min_weekly_offs', '2').expect(403)).body.message).toMatch(/org\.settings\.manage/);
    const a = await tenantPrisma.forTenant({ organizationId: orgId, isSuperAdmin: false }, (tx) => tx.auditLog.findFirst({ where: { organizationId: orgId, action: 'org.setting.changed', actorUserId: users.time }, orderBy: { createdAt: 'asc' } }));
    expect(JSON.parse(a!.metadataJson ?? '{}')).toMatchObject({ key: 'leave.year_start_month', to: '4' });
  });

  it('negative: a Time admin without the company settings key, or anyone else, is refused', async () => {
    await put('time', 'roster.max_weekly_hours', '40').expect(403);
    await put('plain', 'leave.comp_off.expiry_days', '30').expect(403);
    await api('plain', 'get', '/org/settings').expect(403);
  });
});
