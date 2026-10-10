import { Test } from '@nestjs/testing';
import { INestApplication, LoggerService, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as argon2 from 'argon2';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';
import { createHash, createHmac, randomUUID } from 'crypto';
import Redis from 'ioredis';
import { OrgSecretsCryptoService, PrismaService, STEP_UP_REQUIRED_CODE, TenantPrismaService, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { AppModule } from '../src/app.module';
import { EmailService } from '../src/email/email.service';
import { assertPublicHttpsUrl } from '../src/common/ssrf';
import { devSmsSink } from '../src/sms/providers';
import { PUBLIC_GATEWAY_NET, SMS_GATEWAY_NET, SmsChannelService, SmsGatewayNet, smsMonth } from '../src/sms-channel/sms-channel.service';
import { mountSmsCallbackBody } from '../src/sms-channel/sms-channel.controller';
import { markSteppedUp } from './fixtures/step-up';
import { trackEmailCodes, trackOtpSends } from './fixtures/sms';
import { OtpService } from '../src/auth/otp.service';

// P04 SMS channel end to end, against the real database (forced RLS, app role), real Redis and a local
// mock HTTP gateway (no real provider): accounts with write-only secrets, failover, retries only where
// safe, DLT templates, email fallback, the monthly cap, consent, idempotency, callbacks and SSRF.
describe('SMS channel (P04 §4.4/§4.5a; YX-NTF-07/10/11/12/13/14)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let channel: SmsChannelService;
  let settle: () => Promise<void>;
  let redis: Redis;
  const email = { send: jest.fn().mockResolvedValue({ success: true }) };
  const SUPER = { organizationId: null, isSuperAdmin: true };
  const PASSWORD = 'Corr3ct-Horse-Battery';
  const runId = randomUUID().slice(0, 8);
  const seed = Number.parseInt(runId.slice(0, 6), 16) % 900_000;
  const mobile = (n: number) => `+9197${String(seed + n * 1000).padStart(8, '0')}`;
  const server = () => app.getHttpServer();

  // ---- the mock gateway: https://gateway.mock.test/<path> is served by a local http server --------
  const MOCK_HOST = 'gateway.mock.test';
  const hits: { path: string; headers: IncomingMessage['headers']; body: string }[] = [];
  let busyOnce = new Set<string>();
  let gateway: Server;
  let gatewayPort = 0;
  let seq = 0;
  function startGateway(): Promise<void> {
    gateway = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const path = (req.url ?? '').split('?')[0];
        hits.push({ path, headers: req.headers, body });
        const reply = (status: number, payload: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
        if (path.endsWith('/reject')) return reply(400, { status: 'error', message: 'Invalid DLT template' });
        if (path.endsWith('/server-error')) return reply(500, { status: 'error' });
        if (path.endsWith('/busy-once') && !busyOnce.has(body)) {
          busyOnce.add(body);
          return reply(503, { status: 'busy' });
        }
        return reply(200, { status: 'success', messages: [{ id: `gw-${++seq}` }] });
      });
    });
    return new Promise((resolve) => gateway.listen(0, '127.0.0.1', () => ((gatewayPort = (gateway.address() as AddressInfo).port), resolve())));
  }
  // The real DNS-checked, address-pinned network for every host except the mock gateway.
  const testNet: SmsGatewayNet = {
    assertPublicUrl: async (url) => (url.hostname === MOCK_HOST ? assertPublicHttpsUrl(url) : PUBLIC_GATEWAY_NET.assertPublicUrl(url)),
    fetch: (url, init) => {
      const target = new URL(url);
      if (target.hostname !== MOCK_HOST) return PUBLIC_GATEWAY_NET.fetch(url, init);
      return fetch(`http://127.0.0.1:${gatewayPort}${target.pathname}${target.search}`, { method: init.method, headers: init.headers, body: init.body, redirect: 'manual' });
    },
  };

  // ---- everything logged during the suite, to prove no secret, number or code is ever logged ------
  const printed: string[] = [];
  const record = (...args: unknown[]) => void printed.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '));
  const recorder: LoggerService = { log: record, error: record, warn: record, debug: record, verbose: record };

  let planId: string;
  const org = { A: { id: '', slug: '' }, B: { id: '', slug: '' } };
  const users: Record<string, string> = {};
  const token: Record<string, string> = {};
  const SECRET = { authkey: `authkey-${runId}-do-not-leak`, callback: `cb-secret-${runId}-0123456789`, callbackB: `cb-secret-B-${runId}-012345`, superKey: `shared-${runId}-key` };

  const api = (who: string, method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(server())[method](`/api/v1/notifications/sms${path}`).set('Authorization', `Bearer ${token[who]}`);
  const OTP_TEMPLATE = { dltTemplateId: '1107169876543210987', body: '{#var#} is your YukthiX {#var#}. Valid for {#var#} minutes. Do not share. -KAVERI', variables: ['code', 'purpose', 'minutes'], status: 'approved' };
  const httpAccount = (name: string, path: string, priority: number, extra: object = {}) => ({
    name,
    provider: 'http',
    sender: 'KAVERI',
    dltEntityId: '1101234567890123456',
    priority,
    config: {
      url: `https://${MOCK_HOST}/v1/${path}`,
      contentType: 'application/x-www-form-urlencoded',
      bodyTemplate: 'apikey={secret.authkey}&numbers={to_digits}&sender={sender}&message={message}&dlt={dlt_template_id}&ref={idempotency_key}',
      response: { successPath: 'status', successValues: ['success'], messageIdPath: 'messages.0.id' },
      callback: { auth: 'hmac', signatureHeader: 'x-signature', messageIdPath: 'id', statusPath: 'status', addressPath: 'to', delivered: ['delivered'], failed: ['failed'], optedOut: ['opted_out'] },
    },
    secrets: { authkey: SECRET.authkey, callbackSecret: SECRET.callback },
    otpTemplate: OTP_TEMPLATE,
    ...extra,
  });
  const accounts = (organizationId: string | null) => tenantPrisma.forTenant(SUPER, (tx) => tx.channelAccount.findMany({ where: { organizationId } }));
  const delivery = (id: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.notificationDelivery.findUniqueOrThrow({ where: { id } }));
  const send = (organizationId: string, to: string, extra: object = {}) =>
    channel.sendOtp({ organizationId, to, code: String(100000 + Math.floor(Math.random() * 899999)), purpose: 'sign-in code', minutes: 5, idempotencyKey: randomUUID(), recipientUserId: users.field, requestedOnChannel: true, ...extra });
  const setPolicy = (organizationId: string, data: object) =>
    tenantPrisma.forTenant(SUPER, (tx) => tx.tenantNotificationPolicy.upsert({ where: { organizationId }, create: { organizationId, ...data }, update: data }));
  const wipeAccounts = (organizationId: string) => tenantPrisma.forTenant(SUPER, (tx) => tx.channelAccount.deleteMany({ where: { organizationId } }));
  const createAccount = async (who: 'adminA' | 'adminB', body: object) => (await api(who, 'post', '/accounts').send(body).expect(201)).body as { id: string };

  beforeAll(async () => {
    // A laptop's .env may turn the development SMS helpers on (README "Sign-in on your laptop"); this
    // suite proves what is printed and mailed without them.
    process.env.DEV_SMS_LOG_TEXT = '';
    process.env.DEV_SMS_TO_MAIL = '';
    await startGateway();
    const tracked = trackOtpSends(Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EmailService).useValue(email).overrideProvider(SMS_GATEWAY_NET).useValue(testNet));
    const moduleRef = await tracked.builder.compile();
    const settleEmails = trackEmailCodes(moduleRef.get(OtpService));
    settle = async () => {
      await tracked.settle();
      await settleEmails();
    };
    app = moduleRef.createNestApplication({ bodyParser: false, logger: recorder });
    // Exactly as main.ts: callbacks keep their raw bytes for the HMAC check.
    mountSmsCallbackBody(app);
    app.use(json());
    app.use(urlencoded({ extended: true }));
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = moduleRef.get(PrismaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);
    channel = moduleRef.get(SmsChannelService);
    channel.backoff = () => 5;
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

    planId = (await prisma.plan.create({ data: { name: `sms-plan-${runId}`, candidateLimit: 1, aiCreditLimit: 1, proctoringMinutesLimit: 1 } })).id;
    for (const k of ['A', 'B'] as const) {
      const created = await prisma.organization.create({ data: { name: `SMS ${k}`, slug: `sms-${k.toLowerCase()}-${runId}`, planId } });
      org[k] = { id: created.id, slug: created.slug };
    }
    const passwordHash = await argon2.hash(PASSWORD);
    const people: [string, 'A' | 'B' | null, string, string | null][] = [
      ['adminA', 'A', 'org_admin', mobile(1)],
      ['adminA2', 'A', 'org_admin', null],
      ['adminB', 'B', 'org_admin', mobile(2)],
      ['field', 'A', 'panel', mobile(3)],
      ['platform', null, 'super_admin', mobile(4)],
    ];
    for (const [name, k, role, number] of people) {
      const organizationId = k ? org[k].id : null;
      users[name] = (
        await tenantPrisma.forTenant(organizationId ? { organizationId, isSuperAdmin: false } : SUPER, (tx) =>
          tx.user.create({ data: { organizationId, email: `${name}-${runId}@sms.test`, passwordHash, role, mobileNumber: number, mobileVerifiedAt: number ? new Date() : null } }),
        )
      ).id;
    }
    for (const [name, k] of [['adminA', 'A'], ['adminB', 'B'], ['adminA2', 'A'], ['platform', null]] as const) {
      const res = await request(server())
        // YukthiX platform staff sign in through their own path only (W-005).
        .post(k ? '/api/v1/auth/staff/login' : '/api/v1/auth/platform/login')
        .send({ ...(k ? { organizationSlug: org[k].slug } : {}), email: `${name}-${runId}@sms.test`, password: PASSWORD })
        .expect(200);
      token[name] = res.body.accessToken;
    }
  });

  beforeEach(() => email.send.mockClear());

  afterAll(async () => {
    const ids = [org.A.id, org.B.id];
    await tenantPrisma
      .forTenant(SUPER, async (tx) => {
        await tx.channelAccount.deleteMany({ where: { OR: [{ organizationId: { in: ids } }, { organizationId: null, name: { startsWith: `Shared ${runId}` } }] } });
        await tx.refreshToken.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.session.deleteMany({ where: { userId: { in: Object.values(users) } } });
        await tx.user.deleteMany({ where: { id: { in: Object.values(users) } } });
        await tx.tenantSecurityPolicy.deleteMany({ where: { organizationId: { in: ids } } });
        await tx.organization.deleteMany({ where: { id: { in: ids } } });
      })
      .catch(() => undefined);
    await prisma.plan.delete({ where: { id: planId } }).catch(() => undefined);
    redis.disconnect();
    await app.close();
    await new Promise((r) => gateway.close(r));
  });

  describe('admin API: accounts with write-only secrets (step-up)', () => {
    it('saving an account needs a fresh step-up; reading does not', async () => {
      await api('adminA', 'get', '').expect(200);
      const refused = await api('adminA', 'post', '/accounts').send(httpAccount('Primary', 'reject', 10)).expect(403);
      expect(refused.body.code).toBe(STEP_UP_REQUIRED_CODE);
      for (const who of ['adminA', 'adminB', 'platform']) await markSteppedUp(tenantPrisma, token[who]);
    });

    it('creates an account; secrets are stored encrypted, returned only by name, never in the audit log', async () => {
      const created = await api('adminA', 'post', '/accounts').send(httpAccount('Primary', 'reject', 10)).expect(201);
      expect(created.body).toMatchObject({ name: 'Primary', provider: 'http', sender: 'KAVERI', priority: 10, status: 'active', secretsSet: ['callbackSecret', 'secret.authkey'] });
      expect(created.body.callbackUrl).toMatch(new RegExp(`/api/v1/notifications/sms/callbacks/${created.body.id}$`));
      expect(created.body.config).not.toHaveProperty('secrets');
      expect(created.body.config).not.toHaveProperty('callbackSecret');
      const everything = JSON.stringify([created.body, (await api('adminA', 'get', '').expect(200)).body]);
      for (const secret of [SECRET.authkey, SECRET.callback]) expect(everything).not.toContain(secret);

      const [row] = await accounts(org.A.id);
      expect(row.configEncrypted).not.toContain(SECRET.authkey);
      expect(JSON.parse(app.get(OrgSecretsCryptoService).decrypt(row.configEncrypted)).secrets.authkey).toBe(SECRET.authkey);
      const audit = await tenantPrisma.forTenant(SUPER, (tx) => tx.auditLog.findMany({ where: { organizationId: org.A.id, action: { startsWith: 'notification.sms_' } } }));
      expect(audit.map((a) => a.action)).toEqual(['notification.sms_account_created']);
      expect(JSON.stringify(audit)).not.toContain(SECRET.authkey);
    });

    it('an edit keeps secrets it does not mention; null removes one; a secret cannot be smuggled in config', async () => {
      const [row] = await accounts(org.A.id);
      const kept = await api('adminA', 'patch', `/accounts/${row.id}`).send({ name: 'Primary gateway' }).expect(200);
      expect(kept.body.secretsSet).toEqual(['callbackSecret', 'secret.authkey']);
      await api('adminA', 'patch', `/accounts/${row.id}`).send({ secrets: { authkey: null } }).expect(400); // the body still uses {secret.authkey}
      await api('adminA', 'patch', `/accounts/${row.id}`).send({ config: { ...httpAccount('x', 'reject', 1).config, callbackSecret: 'x'.repeat(20) } }).expect(400);
      await api('adminA', 'patch', `/accounts/${row.id}`).send({ config: { ...httpAccount('x', 'reject', 1).config, secrets: { authkey: 'x' } } }).expect(400);
      const removed = await api('adminA', 'patch', `/accounts/${row.id}`).send({ secrets: { callbackSecret: null } }).expect(200);
      expect(removed.body.secretsSet).toEqual(['secret.authkey']);
      await api('adminA', 'patch', `/accounts/${row.id}`).send({ secrets: { callbackSecret: SECRET.callback } }).expect(200);
    });

    it('two accounts of one company cannot share a name (any case); keeping its own name is fine', async () => {
      const [row] = await accounts(org.A.id);
      const clash = await api('adminA', 'post', '/accounts').send(httpAccount('primary GATEWAY', 'reject', 20)).expect(409);
      expect(clash.body.message).toContain('already exists');
      await api('adminA', 'patch', `/accounts/${row.id}`).send({ name: 'Primary gateway' }).expect(200);
      expect(await accounts(org.A.id)).toHaveLength(1);
    });

    it('a company never reads, edits or tests another company’s account', async () => {
      const [row] = await accounts(org.A.id);
      expect((await api('adminB', 'get', '').expect(200)).body.accounts).toEqual([]);
      await api('adminB', 'patch', `/accounts/${row.id}`).send({ name: 'mine now' }).expect(404);
      await api('adminB', 'post', `/accounts/${row.id}/test`).expect(404);
      await api('adminB', 'delete', `/accounts/${row.id}`).expect(404);
      expect((await accounts(org.A.id))[0].name).toBe('Primary gateway');
    });

    it.each([
      ['plain http', `http://${MOCK_HOST}/v1/ok`],
      ['a private address', 'https://10.20.30.40/send'],
      ['localhost', 'https://localhost/send'],
      ['the cloud metadata address', 'https://169.254.169.254/latest/meta-data/'],
      ['IPv6 loopback', 'https://[::1]/send'],
      ['a variable in the host', 'https://{secret.authkey}.example.com/send'],
    ])('SSRF: refuses %s', async (_what, url) => {
      const body = httpAccount('Evil', 'ok', 50);
      await api('adminA', 'post', '/accounts').send({ ...body, config: { ...body.config, url } }).expect(400);
    });

    it('SSRF: refuses a public-looking host that resolves to a private address (DNS checked at save)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const dns = require('dns') as typeof import('dns');
      const lookup = jest.spyOn(dns, 'lookup').mockImplementation(((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
        cb(null, [{ address: '10.0.0.7', family: 4 }])) as never);
      try {
        const body = httpAccount('Rebind', 'ok', 50);
        const res = await api('adminA', 'post', '/accounts').send({ ...body, config: { ...body.config, url: 'https://sms.rebind-attack.example/send' } }).expect(400);
        expect(res.body.message).toMatch(/public https/);
      } finally {
        lookup.mockRestore();
      }
    });

    it('refuses a template whose {#var#} do not match its variables, or without the code', async () => {
      await api('adminA', 'post', '/accounts').send(httpAccount('Bad', 'ok', 50, { otpTemplate: { ...OTP_TEMPLATE, variables: ['code'] } })).expect(400);
      await api('adminA', 'post', '/accounts').send(httpAccount('Bad', 'ok', 50, { otpTemplate: { ...OTP_TEMPLATE, variables: ['purpose', 'purpose', 'minutes'] } })).expect(400);
      await api('adminA', 'post', '/accounts').send(httpAccount('Bad', 'ok', 50, { otpTemplate: { ...OTP_TEMPLATE, dltTemplateId: null } })).expect(400);
    });

    it('non-admins have no access', async () => {
      const field = await request(server()).post('/api/v1/auth/staff/login').send({ organizationSlug: org.A.slug, email: `field-${runId}@sms.test`, password: PASSWORD }).expect(200);
      await request(server()).get('/api/v1/notifications/sms').set('Authorization', `Bearer ${field.body.accessToken}`).expect(403);
    });
  });

  describe('sending a code: failover, retries, templates (YX-NTF-07/10)', () => {
    let primary: string;
    let backup: string;
    beforeAll(async () => {
      primary = (await accounts(org.A.id))[0].id;
      backup = (await createAccount('adminA', httpAccount('Backup', 'ok', 20))).id;
    });

    it('tries the company’s accounts by priority: a refused send fails over to the next account', async () => {
      hits.length = 0;
      const outcome = await send(org.A.id, mobile(3));
      expect(outcome.status).toBe('sent');
      expect(hits.map((h) => h.path)).toEqual(['/v1/reject', '/v1/ok']);
      const row = await delivery((outcome as { deliveryId: string }).deliveryId);
      expect(row).toMatchObject({ channel: 'sms', kind: 'otp', status: 'sent', channelAccountId: backup, provider: 'http', providerMsgId: expect.stringMatching(/^gw-\d+$/), attempts: 2, costUnits: 1 });
      expect(row.addressMasked).toMatch(/^\+91•+\d\d$/);
      expect(row.error).toMatch(/^Primary gateway: gateway refused the message \(HTTP 400\)$/);
      // The DLT-registered text, sender and template id reached the gateway, with its key.
      const form = new URLSearchParams(hits[1].body);
      expect(form.get('apikey')).toBe(SECRET.authkey);
      expect(form.get('numbers')).toBe(mobile(3).slice(1));
      expect(form.get('sender')).toBe('KAVERI');
      expect(form.get('dlt')).toBe(OTP_TEMPLATE.dltTemplateId);
      expect(form.get('message')).toMatch(/^\d{6} is your YukthiX sign-in code\. Valid for 5 minutes\. Do not share\. -KAVERI$/);
    });

    it('retries the same account only when the gateway asked to (503), then sends', async () => {
      await api('adminA', 'patch', `/accounts/${backup}`).send({ config: { ...httpAccount('x', 'busy-once', 0).config } }).expect(200);
      await api('adminA', 'patch', `/accounts/${primary}`).send({ status: 'disabled' }).expect(200);
      hits.length = 0;
      const outcome = await send(org.A.id, mobile(3));
      expect(outcome.status).toBe('sent');
      expect(hits.map((h) => h.path)).toEqual(['/v1/busy-once', '/v1/busy-once']);
      expect(await delivery((outcome as { deliveryId: string }).deliveryId)).toMatchObject({ status: 'sent', attempts: 2, channelAccountId: backup });
    });

    it('never resends a code that may already have arrived: a 5xx stops everything, no failover, no email', async () => {
      await api('adminA', 'patch', `/accounts/${primary}`).send({ status: 'active', config: { ...httpAccount('x', 'server-error', 0).config } }).expect(200);
      hits.length = 0;
      const outcome = await send(org.A.id, mobile(3));
      expect(outcome.status).toBe('unknown');
      expect(hits.map((h) => h.path)).toEqual(['/v1/server-error']);
      expect(await delivery((outcome as { deliveryId: string }).deliveryId)).toMatchObject({ status: 'unknown', channelAccountId: primary, attempts: 1 });
      await api('adminA', 'patch', `/accounts/${primary}`).send({ config: { ...httpAccount('x', 'reject', 0).config } }).expect(200);
    });

    it('a retried job never sends twice (idempotency key, YX-NTF-02)', async () => {
      hits.length = 0;
      const key = randomUUID();
      // Each call carries a different code: only the first call's code may ever reach a gateway.
      const codes = () => new Set(hits.map((h) => new URLSearchParams(h.body).get('message')));
      const first = await send(org.A.id, mobile(3), { idempotencyKey: key });
      const sentHits = hits.length;
      const again = await send(org.A.id, mobile(3), { idempotencyKey: key });
      expect(first.status).toBe('sent');
      expect(again).toEqual({ status: 'duplicate' });
      expect(hits.length).toBe(sentHits);
      expect(codes().size).toBe(1);
      // Concurrent retries of one job: exactly one goes.
      hits.length = 0;
      const key2 = randomUUID();
      const results = await Promise.all([1, 2, 3].map(() => send(org.A.id, mobile(3), { idempotencyKey: key2 })));
      expect(results.filter((r) => r.status === 'duplicate')).toHaveLength(2);
      expect(results.filter((r) => r.status === 'sent')).toHaveLength(1);
      expect(codes().size).toBe(1);
    });

    it('records the request as an authentication-only opt-in, once per number (YX-NTF-14)', async () => {
      const consents = await tenantPrisma.forTenant(SUPER, (tx) => tx.channelConsent.findMany({ where: { organizationId: org.A.id, recipientId: users.field } }));
      expect(consents).toEqual([
        expect.objectContaining({ channel: 'sms', scope: 'authentication_only', source: 'otp_prompt', textVersion: 'otp-request-v1', capturedBy: users.field, withdrawnAt: null }),
      ]);
      expect(consents[0].addressHash).not.toContain(mobile(3).slice(-6));
    });

    it('without a request on SMS and without an active opt-in, nothing is texted (YX-NTF-14)', async () => {
      hits.length = 0;
      const outcome = await send(org.A.id, mobile(7), { requestedOnChannel: false });
      expect(outcome).toMatchObject({ status: 'fallback', reason: 'no_channel_consent' });
      expect(hits).toEqual([]);
    });

    it('the shared account comes after the company’s accounts, only when the company allows it', async () => {
      // Both company accounts refuse.
      await api('adminA', 'patch', `/accounts/${backup}`).send({ config: { ...httpAccount('x', 'reject', 0).config } }).expect(200);
      const before = devSmsSink.sent.length;
      const viaShared = await send(org.A.id, mobile(3));
      expect(viaShared.status).toBe('sent');
      expect(devSmsSink.sent.length).toBe(before + 1);
      expect(await delivery((viaShared as { deliveryId: string }).deliveryId)).toMatchObject({ provider: 'dev', attempts: 3 });

      await api('adminA', 'patch', '/policy').send({ useSharedAccount: false }).expect(200);
      const none = await send(org.A.id, mobile(3));
      expect(none).toMatchObject({ status: 'fallback', reason: 'all_providers_failed' });
      expect(devSmsSink.sent.length).toBe(before + 1);
      expect((await delivery((none as { deliveryId: string }).deliveryId)).error).toMatch(/^all_providers_failed: Primary gateway: .*; Backup: /);
    });
  });

  describe('sign-in by SMS falls back to email (YX-NTF-07)', () => {
    const signInBySms = async (ip: string) => {
      const id = createHash('sha256').update(`signin ${org.A.slug} ${mobile(3)}`).digest('hex');
      await redis.del(`auth:otp:cool:${id}`, `auth:otp:sends:${id}`);
      await request(server()).post('/api/v1/auth/otp/start').set('X-Forwarded-For', ip).send({ organizationSlug: org.A.slug, identifier: mobile(3), channel: 'sms' }).expect(200);
      await settle();
    };
    const lastFieldDelivery = () => tenantPrisma.forTenant(SUPER, (tx) => tx.notificationDelivery.findFirstOrThrow({ where: { organizationId: org.A.id }, orderBy: { createdAt: 'desc' } }));
    beforeAll(async () => {
      await tenantPrisma.forTenant(SUPER, (tx) =>
        tx.tenantSecurityPolicy.create({ data: { organizationId: org.A.id, otpSignInChannels: ['email', 'sms'] } }),
      );
      invalidateTenantSecurityPolicy(org.A.id);
    });

    it('all gateways failing: the code goes to the account’s email instead', async () => {
      await signInBySms('2001:db8:5::1');
      await settle();
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: `field-${runId}@sms.test`, subject: expect.stringMatching(/^\d{6} is your YukthiX sign-in code$/) }));
      expect(email.send.mock.calls[0][0].text).toMatch(/couldn't send this code by text message[\s\S]*\n\d{6}\n/);
      expect(await lastFieldDelivery()).toMatchObject({ status: 'fallback', error: expect.stringMatching(/^all_providers_failed/) });
    });

    it('no approved DLT template: email instead, and the log says why', async () => {
      await wipeAccounts(org.A.id);
      await createAccount('adminA', httpAccount('Pending DLT', 'ok', 10, { otpTemplate: { ...OTP_TEMPLATE, status: 'pending' } }));
      hits.length = 0;
      await signInBySms('2001:db8:5::2');
      await settle();
      expect(hits).toEqual([]);
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: `field-${runId}@sms.test` }));
      expect(await lastFieldDelivery()).toMatchObject({ status: 'fallback', error: 'no_approved_template: Pending DLT: template is pending, not approved' });
      // Nobody is offered a texted second step or number check that can't arrive.
      expect(await channel.hasRoute(org.A.id)).toBe(false);
      expect(await channel.hasRoute(org.B.id)).toBe(true); // B: the shared account (development sink here)
    });

    it('over the monthly cap: email instead, and the admins are told once', async () => {
      await wipeAccounts(org.A.id);
      await createAccount('adminA', httpAccount('Main', 'ok', 10));
      const used = (await api('adminA', 'get', '').expect(200)).body.usage.sent as number;
      await api('adminA', 'patch', '/policy').send({ monthlyCap: used + 1 }).expect(200);
      expect((await send(org.A.id, mobile(3))).status).toBe('sent');
      const overview = (await api('adminA', 'get', '').expect(200)).body;
      expect(overview.usage).toEqual({ month: smsMonth(), sent: used + 1, cap: used + 1 });

      email.send.mockClear();
      await signInBySms('2001:db8:5::3');
      expect(await lastFieldDelivery()).toMatchObject({ status: 'fallback', error: 'over_monthly_cap' });
      await settle();
      expect(email.send).toHaveBeenCalledWith(expect.objectContaining({ to: `field-${runId}@sms.test`, subject: expect.stringMatching(/^\d{6} is your YukthiX sign-in code$/) }));
      await new Promise((r) => setTimeout(r, 300));
      const alerts = () => email.send.mock.calls.filter(([m]) => m.subject === 'Your organisation has reached its monthly SMS limit').map(([m]) => m.to).sort();
      expect(alerts()).toEqual([`adminA-${runId}@sms.test`, `adminA2-${runId}@sms.test`]);
      expect((await send(org.A.id, mobile(3))).status).toBe('fallback');
      await new Promise((r) => setTimeout(r, 300));
      expect(alerts()).toHaveLength(2); // once a month
      await api('adminA', 'patch', '/policy').send({ monthlyCap: null }).expect(200);
    });

    it('the cap holds under concurrent sends (atomic reservation)', async () => {
      const used = (await api('adminA', 'get', '').expect(200)).body.usage.sent as number;
      await setPolicy(org.A.id, { smsMonthlyCap: used + 2 });
      const results = await Promise.all(Array.from({ length: 6 }, () => send(org.A.id, mobile(3))));
      expect(results.filter((r) => r.status === 'sent')).toHaveLength(2);
      expect(results.filter((r) => r.status === 'fallback' && r.reason === 'over_monthly_cap')).toHaveLength(4);
      await setPolicy(org.A.id, { smsMonthlyCap: null });
    });
  });

  describe('provider callbacks (YX-NTF-10/11)', () => {
    let accountA: string;
    let accountB: string;
    let sentA: { deliveryId: string; msgId: string };
    const callback = (accountId: string, payload: object, secret: string | null, path = '') => {
      const body = JSON.stringify(payload);
      const req = request(server()).post(`/api/v1/notifications/sms/callbacks/${accountId}${path}`).set('Content-Type', 'application/json');
      if (secret) req.set('x-signature', createHmac('sha256', secret).update(body).digest('hex'));
      return req.send(body);
    };
    beforeAll(async () => {
      accountA = (await accounts(org.A.id))[0].id;
      accountB = (await createAccount('adminB', { ...httpAccount('B gateway', 'ok', 10), secrets: { authkey: 'b-key', callbackSecret: SECRET.callbackB } })).id;
      const outcome = (await send(org.A.id, mobile(3))) as { deliveryId: string };
      sentA = { deliveryId: outcome.deliveryId, msgId: (await delivery(outcome.deliveryId)).providerMsgId! };
    });

    it('a forged, unsigned or other-account signature is a bare 401 and changes nothing', async () => {
      await callback(accountA, { id: sentA.msgId, status: 'delivered' }, null).expect(401);
      await callback(accountA, { id: sentA.msgId, status: 'delivered' }, 'forged-secret-0123456789').expect(401);
      await callback(accountA, { id: sentA.msgId, status: 'delivered' }, SECRET.callbackB).expect(401);
      await callback(randomUUID(), { id: sentA.msgId, status: 'delivered' }, SECRET.callback).expect(401);
      expect((await delivery(sentA.deliveryId)).status).toBe('sent');
    });

    it('another company’s account can never touch this company’s delivery, even with its own valid signature', async () => {
      const res = await callback(accountB, { id: sentA.msgId, status: 'failed' }, SECRET.callbackB).expect(200);
      expect(res.body).toEqual({ ok: true, updated: 0 });
      expect((await delivery(sentA.deliveryId)).status).toBe('sent');
    });

    it('a signed delivery report updates the delivery', async () => {
      const res = await callback(accountA, { id: sentA.msgId, status: 'delivered' }, SECRET.callback).expect(200);
      expect(res.body).toEqual({ ok: true, updated: 1 });
      expect(await delivery(sentA.deliveryId)).toMatchObject({ status: 'delivered', deliveredAt: expect.any(Date) });
    });

    it('an opt-out withdraws the consent: no more texts unless the person asks again (YX-NTF-11/14)', async () => {
      await callback(accountA, { status: 'opted_out', to: mobile(3).slice(1) }, SECRET.callback).expect(200);
      const consents = await tenantPrisma.forTenant(SUPER, (tx) => tx.channelConsent.findMany({ where: { organizationId: org.A.id, recipientId: users.field } }));
      expect(consents.every((c) => c.withdrawnAt && c.withdrawalSource === 'stop_keyword')).toBe(true);
      expect(await send(org.A.id, mobile(3), { requestedOnChannel: false })).toMatchObject({ status: 'fallback', reason: 'no_channel_consent' });
      // Asking for a code by SMS again is a new opt-in (a new row; the old one stays withdrawn).
      expect((await send(org.A.id, mobile(3))).status).toBe('sent');
      const after = await tenantPrisma.forTenant(SUPER, (tx) => tx.channelConsent.findMany({ where: { organizationId: org.A.id, recipientId: users.field } }));
      expect(after).toHaveLength(consents.length + 1);
    });

    it('consents are append-only for the app: no delete, no rewrite, a withdrawal is stamped once', async () => {
      const [withdrawn] = await tenantPrisma.forTenant(SUPER, (tx) => tx.channelConsent.findMany({ where: { organizationId: org.A.id, withdrawnAt: { not: null } } }));
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRaw`DELETE FROM channel_consents WHERE id = ${withdrawn.id}::uuid`)).rejects.toThrow(/permission denied/);
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRaw`UPDATE channel_consents SET scope = 'all_service' WHERE id = ${withdrawn.id}::uuid`)).rejects.toThrow(/permission denied/);
      await expect(
        tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRaw`UPDATE channel_consents SET withdrawn_at = now(), withdrawal_source = 'hr' WHERE id = ${withdrawn.id}::uuid`),
      ).rejects.toThrow(/append-only/);
      await expect(tenantPrisma.forTenant(SUPER, (tx) => tx.$executeRaw`DELETE FROM notification_deliveries WHERE id = ${sentA.deliveryId}::uuid`)).rejects.toThrow(/permission denied/);
    });
  });

  describe('test send, delivery log and the shared account', () => {
    it('a test message goes only to the admin’s own verified number, through that account only', async () => {
      const [main] = await accounts(org.A.id);
      await api('adminA2', 'post', `/accounts/${main.id}/test`).expect(400); // no verified number
      hits.length = 0;
      const res = await api('adminA', 'post', `/accounts/${main.id}/test`).expect(200);
      expect(res.body).toMatchObject({ status: 'sent', to: expect.stringMatching(/^\+91•+\d\d$/) });
      expect(hits).toHaveLength(1);
      expect(new URLSearchParams(hits[0].body).get('numbers')).toBe(mobile(1).slice(1));
      expect(new URLSearchParams(hits[0].body).get('message')).toContain('test message');
    });

    it('the delivery log shows the company’s own rows, masked, newest first, paged', async () => {
      const log = (await api('adminA', 'get', '/deliveries').expect(200)).body;
      expect(log.data.length).toBeGreaterThan(5);
      expect(log.data[0]).toMatchObject({ kind: 'test', status: 'sent', account: 'Main', provider: 'http' });
      expect(JSON.stringify(log)).not.toMatch(/\+91\d{10}/);
      const shared = log.data.find((d: { provider: string | null; account: string | null }) => d.account === 'YukthiX shared');
      expect(shared).toMatchObject({ provider: null });
      expect((await api('adminB', 'get', '/deliveries').expect(200)).body.data).toEqual([]);
      if (log.nextCursor) {
        const next = (await api('adminA', 'get', `/deliveries?before=${log.nextCursor}`).expect(200)).body;
        expect(next.data.map((d: { id: string }) => d.id)).not.toContain(log.data[0].id);
      }
    });

    it('the platform manages the shared account (in the platform console); companies never see it, only that one exists', async () => {
      const platformApi = (method: 'get' | 'post' | 'delete', path: string) => request(server())[method](`/api/v1/platform/channels/sms${path}`).set('Authorization', `Bearer ${token.platform}`);
      await api('platform', 'get', '').expect(403); // moved out of company settings (step 3)
      const created = await platformApi('post', '/accounts').send({ name: `Shared ${runId}`, provider: 'dev', config: {}, otpTemplate: { ...OTP_TEMPLATE, dltTemplateId: null } }).expect(201);
      expect((await platformApi('get', '').expect(200)).body).toMatchObject({ scope: 'platform', policy: null });
      const company = (await api('adminB', 'get', '').expect(200)).body;
      expect(company).toMatchObject({ scope: 'company', sharedAccountAvailable: true, policy: { useSharedAccount: true, monthlyCap: null } });
      expect(JSON.stringify(company)).not.toContain(created.body.id);
      await api('adminB', 'patch', `/accounts/${created.body.id}`).send({ name: 'taken' }).expect(404);
      const rows = await tenantPrisma.forTenant({ organizationId: org.B.id, isSuperAdmin: false }, (tx) => tx.channelAccount.findMany({ where: { id: created.body.id } }));
      expect(rows).toEqual([]);
      await platformApi('delete', `/accounts/${created.body.id}`).expect(204);
    });
  });

  it('no secret, full number or code was ever printed to the logs', async () => {
    await settle();
    const logs = printed.join(' | ');
    expect(logs).toMatch(/SMS \S+ not sent \(no_channel_consent\)/); // the recorder did see the channel's logs
    for (const secret of Object.values(SECRET)) expect(logs).not.toContain(secret);
    for (const n of [1, 2, 3, 7]) expect(logs).not.toContain(mobile(n));
    expect(logs).not.toMatch(/is your YukthiX/);
  });
});
