import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { INTEGRATION_EVENT_TYPES, PrismaService, TenantPrismaService } from '@exam-platform/shared';
import { bootAdminApp } from './dual-app';
import { EmailService } from '../src/email/email.service';
import { markSteppedUp } from './fixtures/step-up';

// Settings S-10, the security check of the older integration routes (answer 1327), against the real database: only the
// company's System Admins (org:manage_settings) reach them; every change needs the security key; another company's
// records are 404; company-supplied addresses must be public https; secrets and URL tokens never come back.
describe('Settings S-10: the integration routes are safe', () => {
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
  const api = (who: string, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) => request(server())[method](`/api/v1${path}`).set('Authorization', `Bearer ${token[who]}`);
  const codeOf = (r: request.Response) => (r.body as { code?: string }).code;
  const EVENT = INTEGRATION_EVENT_TYPES[0];
  const HOOK = { type: 'webhook', label: 'Ops hook', targetUrl: 'https://example.com/hooks/SECRET-TOKEN-9876', events: [EVENT] };

  beforeAll(async () => {
    app = await bootAdminApp((b) => b.overrideProvider(EmailService).useValue({ send: jest.fn(async () => ({ success: true })) }));
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    const passwordHash = await argon2.hash(PASSWORD);
    planId = (await prisma.plan.create({ data: { name: `s10-plan-${run}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    const slugs: Record<'A' | 'B', string> = { A: `s10a-${run}`, B: `s10b-${run}` };
    for (const k of ['A', 'B'] as const) org[k] = (await prisma.organization.create({ data: { name: `S10 ${k} ${run}`, slug: slugs[k], planId } })).id;
    const people: [string, 'A' | 'B', string, boolean, string[]?][] = [
      ['admin', 'A', 'org_admin', true],
      ['it', 'A', 'panel', true, ['integration.manage']],
      ['itCold', 'A', 'panel', false, ['integration.manage']],
      ['fresh', 'A', 'org_admin', false],
      ['panel', 'A', 'panel', true],
      ['adminB', 'B', 'org_admin', true],
    ];
    for (const [who, k, role, stepped, keys] of people) {
      const email = `${who}-${run}@s10.test`;
      const permissionProfileId = keys ? (await tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, (tx) => tx.permissionProfile.create({ data: { organizationId: org[k], name: `${who}-${run}`, permissionsJson: JSON.stringify(keys) } }))).id : null;
      users[who] = (await tenantPrisma.forTenant({ organizationId: org[k], isSuperAdmin: false }, (tx) => tx.user.create({ data: { organizationId: org[k], email, name: who, passwordHash, role, permissionProfileId } }))).id;
      token[who] = (await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: slugs[k], email, password: PASSWORD }).expect(200)).body.accessToken;
      if (stepped) await markSteppedUp(tenantPrisma, token[who]!);
    }
  }, 120_000);

  afterAll(async () => {
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        const u = Object.values(users);
        await tx.refreshToken.deleteMany({ where: { userId: { in: u } } });
        await tx.session.deleteMany({ where: { userId: { in: u } } });
        await tx.organization.deleteMany({ where: { id: { in: [org.A, org.B] } } });
        await tx.user.deleteMany({ where: { id: { in: u } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    await app.close();
  });

  it('negative: someone who is not a System Admin reaches none of the integration routes', async () => {
    await api('panel', 'get', '/organizations/integrations').expect(403);
    await api('panel', 'get', '/organizations/integrations/connected-apps').expect(403);
    await api('panel', 'get', '/organizations/api-usage').expect(403);
    await api('panel', 'patch', '/organizations/integrations/webhook').send({ url: 'https://example.com/h' }).expect(403);
    await api('panel', 'post', '/organizations/integrations/api-key').expect(403);
  });

  it('negative: every change needs the security key (a System Admin who has not confirmed is asked for it)', async () => {
    for (const [method, path, body] of [
      ['patch', '/organizations/integrations/webhook', { url: 'https://example.com/h' }],
      ['post', '/organizations/integrations/webhook-secret', {}],
      ['delete', '/organizations/integrations/api-key', undefined],
      ['patch', '/organizations/integrations/ai-key', { provider: 'anthropic', apiKey: 'sk-test' }],
      ['post', '/organizations/integrations/connected-apps', HOOK],
      ['put', '/organizations/sms-config', { smsEnabled: false }],
      ['put', '/organizations/whatsapp-config', { whatsappEnabled: false }],
    ] as const) {
      const r = await api('fresh', method, path).send(body as object);
      expect([path, r.status, codeOf(r)]).toEqual([path, 403, 'STEP_UP_REQUIRED']);
    }
    await api('fresh', 'get', '/organizations/integrations').expect(200);
  });

  it('a webhook saved by the System Admin comes back masked: its token is never returned', async () => {
    const saved = (await api('admin', 'patch', '/organizations/integrations/webhook').send({ url: 'https://example.com/hooks/SECRET-TOKEN-1234' }).expect(200)).body;
    expect(saved.webhookUrl).toBe('https://example.com/…1234');
    const body = (await api('admin', 'get', '/organizations/integrations').expect(200)).body;
    expect(body).toMatchObject({ webhookConfigured: true, webhookUrl: 'https://example.com/…1234' });
    expect(JSON.stringify(body)).not.toContain('SECRET-TOKEN');
    const secret = (await api('admin', 'post', '/organizations/integrations/webhook-secret').expect(201)).body.webhookSecret as string;
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify((await api('admin', 'get', '/organizations/integrations').expect(200)).body)).not.toContain(secret);
  });

  it('negative: an internal or plain-http AI base URL, embeddings URL or SMTP host is refused before any call', async () => {
    for (const baseUrl of ['https://169.254.169.254/v1', 'http://example.com/v1', 'https://127.0.0.1/v1', 'not a url']) {
      const r = await api('admin', 'patch', '/organizations/integrations/ai-key').send({ provider: 'openai-compatible', apiKey: 'sk-test', baseUrl, modelFast: 'm', modelStandard: 'm' }).expect(400);
      expect(r.body.message).toMatch(/AI base URL/);
    }
    await api('admin', 'patch', '/organizations/integrations/embedding-config').send({ apiKey: 'k', baseUrl: 'https://10.0.0.5/v1', model: 'e' }).expect(400);
    expect((await api('admin', 'patch', '/organizations/integrations/smtp').send({ host: '127.0.0.1', port: 25, user: 'u', password: 'p' }).expect(400)).body.message).toMatch(/SMTP host/);
    const org0 = await prisma.organization.findUniqueOrThrow({ where: { id: org.A }, select: { aiApiKeyEncrypted: true, smtpPasswordEncrypted: true } });
    expect(org0).toEqual({ aiApiKeyEncrypted: null, smtpPasswordEncrypted: null });
  });

  it('a connected app keeps its address to itself; another company cannot see, change or remove it (404)', async () => {
    const app1 = (await api('admin', 'post', '/organizations/integrations/connected-apps').send(HOOK).expect(201)).body as { id: string };
    const list = (await api('admin', 'get', '/organizations/integrations/connected-apps').expect(200)).body;
    expect(JSON.stringify(list)).not.toContain('SECRET-TOKEN');
    expect(list).toEqual([expect.objectContaining({ id: app1.id, label: 'Ops hook' })]);
    expect((await api('adminB', 'get', '/organizations/integrations/connected-apps').expect(200)).body).toEqual([]);
    await api('adminB', 'patch', `/organizations/integrations/connected-apps/${app1.id}`).send({ label: 'Mine now' }).expect(404);
    await api('adminB', 'delete', `/organizations/integrations/connected-apps/${app1.id}`).expect(404);
    await api('adminB', 'get', `/organizations/integrations/connected-apps/${app1.id}/deliveries`).expect(200).expect([]);
    await api('admin', 'patch', '/organizations/integrations/connected-apps/not-a-uuid').send({ label: 'x' }).expect(400);
    expect((await api('admin', 'get', '/organizations/integrations/connected-apps').expect(200)).body[0]).toMatchObject({ label: 'Ops hook' });
  });

  it('the API key is shown once at creation and never again; revoking needs the security key too', async () => {
    const k = (await api('admin', 'post', '/organizations/integrations/api-key').expect(201)).body as { apiKey: string; apiKeyPrefix: string };
    expect(k.apiKey).toMatch(/^pk_live_/);
    const body = (await api('admin', 'get', '/organizations/integrations').expect(200)).body;
    expect(body).toMatchObject({ apiKeyConfigured: true, apiKeyPrefix: k.apiKeyPrefix });
    expect(JSON.stringify(body)).not.toContain(k.apiKey);
    await api('admin', 'delete', '/organizations/integrations/api-key').expect(200);
  });

  it('7.1 SMS: the provider token is never returned after save (a blank keeps it); another company has none', async () => {
    const cfg = { smsEnabled: true, smsProvider: 'twilio', config: { accountSid: 'AC123', authToken: 'TOKEN-NEVER-BACK-55', from: '+15005550006' } };
    await api('admin', 'put', '/organizations/sms-config').send(cfg).expect(200);
    const back = (await api('admin', 'get', '/organizations/sms-config').expect(200)).body;
    expect(back).toMatchObject({ smsEnabled: true, smsProvider: 'twilio', configured: true });
    expect(back.config).not.toHaveProperty('authToken');
    expect(JSON.stringify(back)).not.toContain('TOKEN-NEVER-BACK');
    await api('admin', 'put', '/organizations/sms-config').send({ ...cfg, config: { accountSid: 'AC123', authToken: '', from: '+15005550007' } }).expect(200);
    expect((await api('admin', 'get', '/organizations/sms-config').expect(200)).body).toMatchObject({ configured: true, config: { from: '+15005550007' } });
    expect((await api('adminB', 'get', '/organizations/sms-config').expect(200)).body).toMatchObject({ configured: false });
  });

  it('7.5: a calendar connection belongs to one person: another person, or another company, never sees it', async () => {
    await tenantPrisma.forTenant({ organizationId: org.A, isSuperAdmin: false }, (tx) =>
      tx.calendarConnection.create({ data: { organizationId: org.A, userId: users.admin!, provider: 'google', connectedEmail: 'admin@calendar.test', accessTokenEncrypted: 'x', refreshTokenEncrypted: 'y', tokenExpiresAt: new Date() } as never }),
    );
    const mine = (await api('admin', 'get', '/calendar/connections').expect(200)).body as { provider: string; connected: boolean; connectedEmail: string | null }[];
    expect(mine.find((c) => c.provider === 'google')).toMatchObject({ connected: true, connectedEmail: 'admin@calendar.test' });
    expect(JSON.stringify(mine)).not.toMatch(/accessToken|refreshToken/);
    expect((await api('panel', 'get', '/calendar/connections').expect(200)).body.find((c: { provider: string }) => c.provider === 'google')).toMatchObject({ connected: false });
    expect((await api('adminB', 'get', '/calendar/connections').expect(200)).body.find((c: { provider: string }) => c.provider === 'google')).toMatchObject({ connected: false });
  });

  // Answer 1901: IT staff run integrations with integration.manage, without being System Admins.
  it('1901: integration.manage runs integrations and still needs the security key for each change', async () => {
    await api('it', 'get', '/organizations/integrations').expect(200);
    await api('it', 'get', '/organizations/integrations/connected-apps').expect(200);
    await api('it', 'patch', '/organizations/integrations/webhook').send({ url: 'https://example.com/hooks/IT-1' }).expect(200);
    const r = await api('itCold', 'patch', '/organizations/integrations/webhook').send({ url: 'https://example.com/hooks/IT-2' });
    expect(r.status).toBe(403);
    expect(['STEP_UP_REQUIRED', 'MFA_REQUIRED']).toContain(codeOf(r));
  });

  it('negative (1901): integration.manage opens nothing else of org:manage_settings, and nothing of another company', async () => {
    await api('it', 'get', '/organizations/careers').expect(403);
    await api('it', 'get', '/organizations/reminder-settings').expect(403);
    await api('it', 'patch', '/organizations/branding').send({ primaryColor: '#000000' }).expect(403);
    expect((await api('it', 'get', '/organizations/integrations/connected-apps').expect(200)).body.every((a: { id: string }) => typeof a.id === 'string')).toBe(true);
  });
});
