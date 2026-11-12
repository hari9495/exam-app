import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-5 (answers 1326, 1333, 1461, 1563), against the real database (forced RLS, app role): each page's change
// history from the audit log, only for settings the person may read; view-only people cannot save; the company audit
// log needs audit.view, filtered by area, person and date; one company never sees another's history.
describe('Settings S-5: change history, view-only pages and the company audit log', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const server = () => app.getHttpServer();
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const api = (who: string, method: 'get' | 'put', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, key: string, value: string) => api(who, 'put', '/org/settings').send({ key, value, scopeType: 'tenant' });
  const TIME_KEYS = 'roster.max_weekly_hours,roster.min_weekly_offs';
  type Row = { key: string; by: string; from: unknown; to: unknown; scope: string; at: string };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s5-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `s5-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `S5 ${k} ${run}`, slug, planId } })).id;
      const at = <T>(fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);
      // hr: changes settings; viewer: the view key only (1333); auditor: audit.view only; projects: Projects manage only.
      const people: [string, string[]][] = k === 'A'
        ? [['hr', ['org.settings.manage', 'org.structure.view']], ['viewer', ['org.structure.view']], ['auditor', ['audit.view']], ['projects', ['projects.manage']], ['plain', []]]
        : [['hr', ['org.settings.manage', 'org.structure.view', 'audit.view']]];
      for (const [who, keys] of people) {
        const permissionProfileId = (await at((tx) => tx.permissionProfile.create({ data: { organizationId: org[k]!, name: `${who}-${k}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id;
        const email = `${who}-${k.toLowerCase()}-${run}@s5.test`;
        const id = `${who}${k}`;
        users[id] = (await at((tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k} ${run}`, passwordHash, role: 'panel', permissionProfileId } }))).id;
        token[id] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
        await markSteppedUp(tenantPrisma, token[id]!);
      }
    }
    // Company A: two changes to a Time & Leave page and one to Projects (3.11); company B: one of its own.
    await put('hrA', 'roster.max_weekly_hours', '45').expect(200);
    await put('hrA', 'roster.min_weekly_offs', '2').expect(200);
    await put('hrA', 'projects.burn.warn_pct', '70').expect(200);
    await put('hrB', 'roster.max_weekly_hours', '40').expect(200);
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

  describe('1326: each page shows its last changes', () => {
    it('who, when, where and before and after, newest first, only the asked settings', async () => {
      const rows = (await api('hrA', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(200)).body as Row[];
      expect(rows.map((r) => [r.key, r.from, r.to])).toEqual(expect.arrayContaining([['roster.max_weekly_hours', null, '45'], ['roster.min_weekly_offs', null, '2']]));
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.by === `hr A ${run}` && r.scope === 'Company')).toBe(true);
      expect(rows[0]!.at >= rows[1]!.at).toBe(true);
    });

    it('at most the limit (20 by default, never more)', async () => {
      expect((await api('hrA', 'get', `/org/settings/history?keys=${TIME_KEYS}&limit=1`).expect(200)).body).toHaveLength(1);
      await api('hrA', 'get', `/org/settings/history?keys=${TIME_KEYS}&limit=21`).expect(400);
      await api('hrA', 'get', '/org/settings/history?keys=no.such.setting').expect(400);
    });

    it('a person sees history only for pages they may open', async () => {
      // The view key reads the company settings (1333), so it reads their history too.
      expect((await api('viewerA', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(200)).body).toHaveLength(2);
      // Projects manage opens 3.11 only: its history yes, the Time & Leave pages no.
      expect((await api('projectsA', 'get', '/org/settings/history?keys=projects.burn.warn_pct').expect(200)).body).toEqual([expect.objectContaining({ key: 'projects.burn.warn_pct', to: '70' })]);
      expect((await api('projectsA', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(403)).body.message).toMatch(/cannot see the changes/);
      // The view key does not open 3.11 (System Admins and Projects managers do).
      await api('viewerA', 'get', '/org/settings/history?keys=projects.burn.warn_pct').expect(403);
      // Nobody else: no settings key at all.
      await api('plainA', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(403);
      await api('auditorA', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(403);
    });

    it('one company never sees another company’s history', async () => {
      const a = (await api('hrA', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(200)).body as Row[];
      const b = (await api('hrB', 'get', `/org/settings/history?keys=${TIME_KEYS}`).expect(200)).body as Row[];
      expect(a.some((r) => r.to === '40')).toBe(false);
      expect(b).toEqual([expect.objectContaining({ key: 'roster.max_weekly_hours', to: '40', by: `hr B ${run}` })]);
    });
  });

  describe('1333: view-only pages', () => {
    it('the view key reads the settings but cannot save; the API refuses', async () => {
      await api('viewerA', 'get', '/org/settings').expect(200);
      await put('viewerA', 'roster.max_weekly_hours', '44').expect(403);
      const rows = (await api('hrA', 'get', '/org/settings/history?keys=roster.max_weekly_hours').expect(200)).body as Row[];
      expect(rows.some((r) => r.to === '44')).toBe(false);
    });
  });

  describe('1563: the company audit log', () => {
    it('refused without audit.view (the settings key alone is not enough)', async () => {
      await api('hrA', 'get', '/payroll/audit').expect(403);
      await api('viewerA', 'get', '/payroll/audit').expect(403);
      await request(server()).get('/api/v1/payroll/audit').expect(401);
    });

    it('filtered by area, person and date', async () => {
      const settings = (await api('auditorA', 'get', '/payroll/audit?area=settings').expect(200)).body.entries as { action: string; actor: string }[];
      expect(settings.length).toBeGreaterThanOrEqual(3);
      expect(settings.every((e) => e.action.startsWith('org.') || e.action.startsWith('setting.'))).toBe(true);
      expect((await api('auditorA', 'get', '/payroll/audit?area=hiring').expect(200)).body.entries).toEqual([]);
      const byHr = (await api('auditorA', 'get', `/payroll/audit?actor=${encodeURIComponent(`hr A ${run}`)}`).expect(200)).body.entries as { actor: string }[];
      expect(byHr.length).toBeGreaterThanOrEqual(3);
      expect(byHr.every((e) => e.actor === `hr A ${run}`)).toBe(true);
      expect((await api('auditorA', 'get', '/payroll/audit?actor=nobody-at-all&area=settings').expect(200)).body.entries).toEqual([]);
      expect((await api('auditorA', 'get', '/payroll/audit?from=2000-01-01&to=2000-01-02').expect(200)).body.entries).toEqual([]);
      await api('auditorA', 'get', '/payroll/audit?area=everything').expect(400);
    });

    it('one company never sees another company’s entries', async () => {
      const a = (await api('auditorA', 'get', '/payroll/audit?area=settings').expect(200)).body.entries as { actor: string }[];
      expect(a.some((e) => e.actor === `hr B ${run}`)).toBe(false);
      const b = (await api('hrB', 'get', '/payroll/audit?area=settings').expect(200)).body.entries as { actor: string }[];
      expect(b.some((e) => e.actor === `hr A ${run}`)).toBe(false);
    });
  });
});
