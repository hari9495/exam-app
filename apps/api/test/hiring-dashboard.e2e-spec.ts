import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';

// Answer 2432 (ANL-02 hiring dashboard), against the real database (forced RLS, app role): GET /analytics/hiring adds the
// company's open jobs and the offers answered in the window; another company's jobs never count; without results:view
// it is refused; a bad date is a 400.
describe('Hiring dashboard figures (ANL-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const run = randomUUID().slice(0, 8);
  const token: Record<string, string> = {};
  const users: Record<string, string> = {};
  const org: Record<string, string> = {};
  let planId = '';
  const api = (who: string, path: string) => request(app.getHttpServer()).get(`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const put = (who: string, path: string) => request(app.getHttpServer()).put(`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const patch = (who: string, path: string) => request(app.getHttpServer()).patch(`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const at = <T>(k: string, fn: (tx: Parameters<Parameters<TenantPrismaService['forTenant']>[1]>[0]) => Promise<T>) => tenantPrisma.forTenant({ organizationId: org[k]!, isSuperAdmin: false }, fn);

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `hd-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B']) {
      const slug = `hd-${k.toLowerCase()}-${run}`;
      org[k] = (await prisma.organization.create({ data: { name: `HD ${k} ${run}`, slug, planId } })).id;
      for (const [who, role] of (k === 'A' ? [['admin', 'org_admin'], ['plain', 'panel']] : [['admin', 'org_admin']]) as [string, string][]) {
        const email = `${who}-${k.toLowerCase()}-${run}@hd.test`;
        users[`${who}${k}`] = (await at(k, (tx) => tx.user.create({ data: { organizationId: org[k]!, email, name: `${who} ${k}`, passwordHash, role } }))).id;
        token[`${who}${k}`] = (await request(app.getHttpServer()).post('/api/v1/auth/staff/login').send({ organizationSlug: slug, email, password: PASSWORD }).expect(200)).body.accessToken;
      }
    }
    for (const [k, status] of [['A', 'open'], ['A', 'open'], ['A', 'closed'], ['A', 'draft'], ['B', 'open']] as const)
      await at(k, (tx) => tx.job.create({ data: { organizationId: org[k]!, title: `${status} ${run}`, status, createdById: users[`admin${k}`]! } }));
  }, 180_000);

  afterAll(async () => {
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('counts the company’s own open jobs and the answered offers (none yet), with the funnel and time to hire', async () => {
    const body = (await api('adminA', '/analytics/hiring').expect(200)).body;
    expect(body).toMatchObject({ openJobs: 2, offers: { accepted: 0, declined: 0 }, timeToHire: { hiredCount: 0 } });
    expect(Array.isArray(body.funnel)).toBe(true);
    expect((await api('adminB', '/analytics/hiring').expect(200)).body.openJobs).toBe(1);
  });

  it('negative: refused without results:view; a bad date is a 400', async () => {
    await api('plainA', '/analytics/hiring').expect(403);
    await api('adminA', '/analytics/hiring?from=not-a-date').expect(400);
  });

  // Answer 2428 (ANL-08 Report schedules): the weekly hiring digest settings, with when it last went out.
  it('the digest: the company admin reads it (never sent yet) and turns it on for a colleague', async () => {
    expect((await api('adminA', '/organizations/scheduled-report-settings').expect(200)).body).toEqual({ enabled: false, recipientUserIds: [], lastSentAt: null });
    expect((await patch('adminA', '/organizations/scheduled-report-settings').send({ enabled: true, recipientUserIds: [users.plainA] }).expect(200)).body).toEqual({ enabled: true, recipientUserIds: [users.plainA] });
    expect((await api('adminA', '/organizations/scheduled-report-settings').expect(200)).body).toMatchObject({ enabled: true, recipientUserIds: [users.plainA] });
  });

  it('negative: no recipients, another company’s person, or no settings key are refused; B never sees A’s digest', async () => {
    await patch('adminA', '/organizations/scheduled-report-settings').send({ enabled: true, recipientUserIds: [] }).expect(400);
    await patch('adminA', '/organizations/scheduled-report-settings').send({ enabled: true, recipientUserIds: [users.adminB] }).expect(400);
    await api('plainA', '/organizations/scheduled-report-settings').expect(403);
    await patch('plainA', '/organizations/scheduled-report-settings').send({ enabled: false }).expect(403);
    expect((await api('adminB', '/organizations/scheduled-report-settings').expect(200)).body).toMatchObject({ enabled: false, recipientUserIds: [] });
  });

  // Answer 2427: record visibility and the daily reminders are switches on Settings 6.1 Hiring.
  it('6.1 shows both switches off; the admin turns record visibility on (kept on the company row, audited)', async () => {
    expect((await api('adminA', '/hiring/settings').expect(200)).body.values).toMatchObject({ 'hiring.record_visibility': 'off', 'hiring.reminders': 'off' });
    const after = (await put('adminA', '/hiring/settings').send({ changes: [{ key: 'hiring.record_visibility', value: 'on' }, { key: 'hiring.reminders', value: 'off' }] }).expect(200)).body;
    expect(after.values).toMatchObject({ 'hiring.record_visibility': 'on', 'hiring.reminders': 'off' });
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.A! } })).recordVisibilityEnabled).toBe(true);
    const logged = await at('A', (tx) => tx.auditLog.findMany({ where: { action: 'org.setting.changed', entityId: org.A! } }));
    expect(logged.map((l) => JSON.parse(l.metadataJson ?? '{}'))).toEqual([expect.objectContaining({ key: 'hiring.record_visibility', from: 'off', to: 'on' })]);
  });

  it('negative: a bad value or someone without the settings key changes nothing; another company is untouched', async () => {
    await put('adminA', '/hiring/settings').send({ changes: [{ key: 'hiring.reminders', value: 'maybe' }] }).expect(400);
    await put('plainA', '/hiring/settings').send({ changes: [{ key: 'hiring.reminders', value: 'on' }] }).expect(403);
    expect((await prisma.organization.findUniqueOrThrow({ where: { id: org.A! } })).remindersEnabled).toBe(false);
    expect((await api('adminB', '/hiring/settings').expect(200)).body.values).toMatchObject({ 'hiring.record_visibility': 'off' });
  });
});
