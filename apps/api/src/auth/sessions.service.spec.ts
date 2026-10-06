import { NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DEFAULT_SECURITY_POLICY, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { DEVICE_COOKIE, SessionsService, resolveClientMeta } from './sessions.service';

describe('resolveClientMeta', () => {
  const res = () => ({ cookie: jest.fn() });

  it('reuses a well-formed device cookie and does not reset it', () => {
    const deviceId = 'A'.repeat(43);
    const r = res();
    const meta = resolveClientMeta({ cookies: { [DEVICE_COOKIE]: deviceId }, ip: '203.0.113.1', get: () => 'UA' } as any, r as any);
    expect(meta).toEqual({ ip: '203.0.113.1', userAgent: 'UA', deviceId });
    expect(r.cookie).not.toHaveBeenCalled();
  });

  it('replaces a missing or tampered device cookie with a fresh random one (HttpOnly, Secure, Lax)', () => {
    for (const cookies of [{}, { [DEVICE_COOKIE]: '<script>' }, { [DEVICE_COOKIE]: 'A'.repeat(500) }]) {
      const r = res();
      const meta = resolveClientMeta({ cookies, ip: '203.0.113.1', get: () => undefined } as any, r as any);
      expect(meta.deviceId).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(r.cookie).toHaveBeenCalledWith(DEVICE_COOKIE, meta.deviceId, expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax' }));
    }
  });

  it('truncates an oversized user agent', () => {
    const meta = resolveClientMeta({ cookies: {}, ip: '1.2.3.4', get: () => 'x'.repeat(5000) } as any, res() as any);
    expect(meta.userAgent).toHaveLength(512);
  });
});

describe('SessionsService', () => {
  const ORG = { organizationId: 'org-1', isSuperAdmin: false };
  const META = { ip: '203.0.113.1', userAgent: 'UA', deviceId: 'B'.repeat(43) };
  const USER = { id: 'user-1', email: 'u@x.test', organizationId: 'org-1', role: 'recruiter' };
  let tx: any;
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let email: { send: jest.Mock };
  let service: SessionsService;

  beforeEach(() => {
    tx = {
      session: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn(), updateMany: jest.fn(), count: jest.fn() },
      loginEvent: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    invalidateTenantSecurityPolicy('org-1');
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    audit = { record: jest.fn() };
    email = { send: jest.fn().mockResolvedValue({}) };
    service = new SessionsService(tenantPrisma as any, audit as any, email as any);
  });

  describe('create', () => {
    it('stores only the device hash, applies the floor limits, and scopes the write to the user tenant', async () => {
      tx.session.findFirst.mockResolvedValue(null);
      tx.session.create.mockImplementation(async ({ data }: any) => ({ id: 's1', absoluteExpiresAt: data.absoluteExpiresAt }));
      const before = Date.now();

      await service.create(USER, 'password', META);

      expect(tenantPrisma.forTenant).toHaveBeenCalledWith(ORG, expect.any(Function));
      const data = tx.session.create.mock.calls[0][0].data;
      expect(data.deviceIdHash).toBe(createHash('sha256').update(META.deviceId).digest('hex'));
      expect(JSON.stringify(data)).not.toContain(META.deviceId);
      expect(data.idleTimeoutSeconds).toBe(30 * 60); // P12 Q8 default
      expect(data.absoluteExpiresAt.getTime() - before).toBeLessThanOrEqual(12 * 3600 * 1000 + 1000); // 12 h floor
    });

    it('never honours an env limit laxer than the YukthiX floor', async () => {
      process.env.SESSION_IDLE_TIMEOUT_MINUTES = '100000';
      process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS = '720';
      try {
        tx.session.findFirst.mockResolvedValue(null);
        tx.session.create.mockImplementation(async ({ data }: any) => ({ id: 's1', absoluteExpiresAt: data.absoluteExpiresAt }));
        const before = Date.now();
        await service.create(USER, 'password', META);
        const data = tx.session.create.mock.calls[0][0].data;
        expect(data.idleTimeoutSeconds).toBe(8 * 3600);
        expect(data.absoluteExpiresAt.getTime() - before).toBeLessThanOrEqual(12 * 3600 * 1000 + 1000);
      } finally {
        delete process.env.SESSION_IDLE_TIMEOUT_MINUTES;
        delete process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS;
      }
    });

    it('flags a new device only when the user has signed in before from elsewhere', async () => {
      tx.session.create.mockResolvedValue({ id: 's1', absoluteExpiresAt: new Date() });

      tx.session.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // first-ever sign-in
      expect((await service.create(USER, 'password', META)).newDevice).toBe(false);

      tx.session.findFirst.mockResolvedValueOnce({ id: 'old' }); // this device seen before
      expect((await service.create(USER, 'password', META)).newDevice).toBe(false);

      tx.session.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'other' }); // known user, unknown device
      expect((await service.create(USER, 'password', META)).newDevice).toBe(true);
    });
  });

  describe('create under the company security policy (YX-IAM-06, Q8)', () => {
    const withPolicy = (overrides: object) =>
      tx.tenantSecurityPolicy.findUnique.mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, ...overrides, organizationId: 'org-1' });
    beforeEach(() => {
      tx.session.findFirst.mockResolvedValue(null);
      tx.session.create.mockImplementation(async ({ data }: any) => ({ id: 'new', absoluteExpiresAt: data.absoluteExpiresAt }));
    });

    it("applies the company's stricter idle and absolute limits", async () => {
      withPolicy({ sessionIdleMinutes: 10, sessionAbsoluteMinutes: 60 });
      const before = Date.now();
      await service.create(USER, 'password', META);
      const data = tx.session.create.mock.calls[0][0].data;
      expect(data.idleTimeoutSeconds).toBe(600);
      expect(data.absoluteExpiresAt.getTime() - before).toBeLessThanOrEqual(3600 * 1000 + 1000);
    });

    it('signs out the least recently used sessions beyond the concurrent-session cap, never the new one', async () => {
      withPolicy({ maxConcurrentSessions: 2 });
      tx.session.findMany.mockResolvedValue([{ id: 'oldest' }]);
      tx.session.updateMany.mockResolvedValue({ count: 1 });
      await service.create(USER, 'password', META);
      expect(tx.session.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', id: { not: 'new' }, revokedAt: null }),
          orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
          skip: 1,
        }),
      );
      expect(tx.session.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['oldest'] }, revokedAt: null },
        data: { revokedAt: expect.any(Date), revokedReason: 'concurrent_limit' },
      });
      expect(audit.record).toHaveBeenCalledWith(ORG, expect.objectContaining({ action: 'session.revoked_concurrent_limit' }));
    });

    it('revokes nothing (and audits nothing) with no cap or when under it', async () => {
      await service.create(USER, 'password', META);
      withPolicy({ maxConcurrentSessions: 5 });
      invalidateTenantSecurityPolicy('org-1');
      tx.session.findMany.mockResolvedValue([]);
      await service.create(USER, 'password', META);
      expect(tx.session.updateMany).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  it('alerts every active admin of a break-glass sign-in, with request data escaped (YX-IAM-04)', async () => {
    tx.user.findMany.mockResolvedValue([{ id: 'a1', email: 'a1@x.test' }, { id: 'a2', email: 'a2@x.test' }]);
    service.notifyBreakGlass(USER, { ...META, userAgent: '<script>x</script>' });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId: 'org-1', role: 'org_admin', status: 'active' } }));
    expect(email.send.mock.calls.map((c) => c[0].to)).toEqual(['a1@x.test', 'a2@x.test']);
    expect(email.send.mock.calls[0][0].html).not.toContain('<script>');
  });

  it('findLive rejects non-uuid ids without touching the database', async () => {
    expect(await service.findLive('family-1', 'user-1')).toBeNull();
    expect(tenantPrisma.forTenant).not.toHaveBeenCalled();
  });

  it('records an attempt against an unknown tenant as a platform row (super-admin scope)', async () => {
    await service.recordLoginEvent({ organizationId: null, identifier: 'x@y.test', result: 'failed', method: 'password', meta: META });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
    expect(tx.loginEvent.create.mock.calls[0][0].data).not.toHaveProperty('deviceId');
  });

  it('a failing login-event write is logged, never turned into a failed sign-in', async () => {
    tx.loginEvent.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.recordLoginEvent({ organizationId: 'org-1', result: 'success', method: 'password', meta: META }),
    ).resolves.toBeUndefined();
  });

  it('listMine marks the caller\'s own session', async () => {
    tx.session.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    expect(await service.listMine(ORG, 'user-1', 's2')).toEqual([{ id: 's1', current: false }, { id: 's2', current: true }]);
  });

  it('revokeMine only touches the caller\'s own sessions and 404s otherwise', async () => {
    tx.session.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.revokeMine(ORG, 'user-1', 'someone-elses')).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { id: 'someone-elses', userId: 'user-1', revokedAt: null },
      data: { revokedAt: expect.any(Date), revokedReason: 'user_revoked' },
    });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('revokeMyOthers keeps the current session', async () => {
    tx.session.updateMany.mockResolvedValue({ count: 3 });
    expect(await service.revokeMyOthers(ORG, 'user-1', 'current')).toEqual({ revoked: 3 });
    expect(tx.session.updateMany.mock.calls[0][0].where).toEqual({ userId: 'user-1', id: { not: 'current' }, revokedAt: null });
    expect(audit.record).toHaveBeenCalledWith(ORG, expect.objectContaining({ action: 'session.revoked_others' }));
  });

  it('a super admin acting inside one tenant only sees that tenant\'s login events', async () => {
    await service.listLoginEvents({ organizationId: 'org-9', isSuperAdmin: true }, { result: 'failed' });
    expect(tx.loginEvent.findMany.mock.calls[0][0].where).toEqual({ organizationId: 'org-9', result: 'failed' });
  });

  it('escapes attacker-controlled request data in notification emails', async () => {
    service.notifyNewDevice(USER, { ...META, userAgent: '<img src=x onerror=alert(1)>' });
    await new Promise((r) => setImmediate(r));
    const html = email.send.mock.calls[0][0].html as string;
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
    expect(email.send.mock.calls[0][0]).toMatchObject({ to: 'u@x.test', organizationId: 'org-1' });
  });
});
