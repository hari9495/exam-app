import {
  DEFAULT_SECURITY_POLICY,
  SecurityPolicySettings,
  invalidateTenantSecurityPolicy,
  ipAllowedForSurface,
  loadTenantSecurityPolicy,
  sessionLimitsFor,
  staffDeskIpAllowed,
} from './tenant-security-policy';

const policy = (overrides: Partial<SecurityPolicySettings>): SecurityPolicySettings => ({ ...DEFAULT_SECURITY_POLICY, ...overrides });

describe('tenant security policy (P12 Q8, YX-IAM-06/09)', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  describe('ipAllowedForSurface', () => {
    const p = policy({ ipAllowlistDesk: ['203.0.113.0/24'], ipAllowlistAdmin: ['198.51.100.7'], ipAllowlistApi: ['2001:db8::/32'] });

    it('an empty list restricts nothing', () => {
      expect(ipAllowedForSurface(DEFAULT_SECURITY_POLICY, 'desk', '192.0.2.1')).toBe(true);
      expect(ipAllowedForSurface(DEFAULT_SECURITY_POLICY, 'api', null)).toBe(true);
    });

    it('checks each surface against its own list only', () => {
      expect(ipAllowedForSurface(p, 'desk', '203.0.113.9')).toBe(true);
      expect(ipAllowedForSurface(p, 'admin', '203.0.113.9')).toBe(false);
      expect(ipAllowedForSurface(p, 'admin', '198.51.100.7')).toBe(true);
      expect(ipAllowedForSurface(p, 'api', '2001:db8::5')).toBe(true);
      expect(ipAllowedForSurface(p, 'api', '203.0.113.9')).toBe(false);
    });

    it('fails closed on a missing or garbage client IP when a list is set', () => {
      expect(ipAllowedForSurface(p, 'desk', null)).toBe(false);
      expect(ipAllowedForSurface(p, 'desk', undefined)).toBe(false);
      expect(ipAllowedForSurface(p, 'desk', 'not-an-ip')).toBe(false);
    });

    it('matches IPv4-mapped IPv6 client addresses', () => {
      expect(ipAllowedForSurface(p, 'desk', '::ffff:203.0.113.9')).toBe(true);
    });
  });

  describe('sessionLimitsFor', () => {
    it('uses the platform default when the company sets nothing', () => {
      delete process.env.SESSION_IDLE_TIMEOUT_MINUTES;
      delete process.env.SESSION_ABSOLUTE_TIMEOUT_HOURS;
      expect(sessionLimitsFor(DEFAULT_SECURITY_POLICY)).toEqual({ idleSeconds: 30 * 60, absoluteSeconds: 12 * 3600 });
    });

    it("applies the company's stricter values", () => {
      expect(sessionLimitsFor(policy({ sessionIdleMinutes: 10, sessionAbsoluteMinutes: 120 }))).toEqual({ idleSeconds: 600, absoluteSeconds: 7200 });
    });

    it('never exceeds the floor even if a laxer value got stored', () => {
      expect(sessionLimitsFor(policy({ sessionIdleMinutes: 10_000, sessionAbsoluteMinutes: 10_000 }))).toEqual({
        idleSeconds: 8 * 3600,
        absoluteSeconds: 12 * 3600,
      });
    });

    it('keeps idle within absolute', () => {
      expect(sessionLimitsFor(policy({ sessionIdleMinutes: 480, sessionAbsoluteMinutes: 60 }))).toEqual({ idleSeconds: 3600, absoluteSeconds: 3600 });
    });
  });

  describe('loadTenantSecurityPolicy / staffDeskIpAllowed', () => {
    const ORG = 'org-cache-test';
    let tenantPrisma: { forTenant: jest.Mock };
    beforeEach(() => {
      invalidateTenantSecurityPolicy(ORG);
      tenantPrisma = { forTenant: jest.fn().mockResolvedValue(null) };
    });

    it('reads in the tenant scope, defaults when no row, and caches', async () => {
      expect(await loadTenantSecurityPolicy(tenantPrisma as any, ORG)).toBe(DEFAULT_SECURITY_POLICY);
      await loadTenantSecurityPolicy(tenantPrisma as any, ORG);
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
      expect(tenantPrisma.forTenant.mock.calls[0][0]).toEqual({ organizationId: ORG, isSuperAdmin: false });
      invalidateTenantSecurityPolicy(ORG);
      await loadTenantSecurityPolicy(tenantPrisma as any, ORG);
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(2);
    });

    it('applies the desk list to tenant staff, impersonators included, but not to platform staff', async () => {
      tenantPrisma.forTenant.mockResolvedValue({ ...policy({ ipAllowlistDesk: ['203.0.113.0/24'] }), organizationId: ORG, updatedAt: new Date(), updatedByUserId: null });
      expect(await staffDeskIpAllowed(tenantPrisma as any, { organizationId: ORG, role: 'recruiter' }, '192.0.2.1')).toBe(false);
      expect(await staffDeskIpAllowed(tenantPrisma as any, { organizationId: ORG, role: 'recruiter' }, '203.0.113.1')).toBe(true);
      expect(await staffDeskIpAllowed(tenantPrisma as any, { organizationId: ORG, role: 'super_admin', actingSuperAdmin: true }, '192.0.2.1')).toBe(true);
      expect(await staffDeskIpAllowed(tenantPrisma as any, { organizationId: null, role: 'super_admin' }, '192.0.2.1')).toBe(true);
    });
  });
});
