import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DEFAULT_SECURITY_POLICY, TENANT_SECURITY_FLOOR, invalidateTenantSecurityPolicy, loadTenantSecurityPolicy } from '@exam-platform/shared';
import { SecurityPolicyService } from './security-policy.service';
import { UpdateSecurityPolicyDto } from './dto/update-security-policy.dto';

const ORG = 'org-sp';
const CTX = { organizationId: ORG, isSuperAdmin: false };
const ADMIN_CALLER = { ip: '203.0.113.10', exemptFromIpLists: false };
const BG = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];

describe('UpdateSecurityPolicyDto: the YukthiX floor (Q8) -- a company may only be stricter', () => {
  const errorsFor = async (body: object) =>
    (await validate(plainToInstance(UpdateSecurityPolicyDto, body), { whitelist: true, forbidNonWhitelisted: true })).map((e) => e.property);

  it.each([
    [{ sessionIdleMinutes: 481 }, 'sessionIdleMinutes'], // laxer than the 8 h idle ceiling
    [{ sessionIdleMinutes: 4 }, 'sessionIdleMinutes'],
    [{ sessionAbsoluteMinutes: 721 }, 'sessionAbsoluteMinutes'], // laxer than the 12 h absolute ceiling
    [{ passwordMinLength: 11 }, 'passwordMinLength'], // below the 12-character floor
    [{ passwordMinLength: null }, 'passwordMinLength'],
    [{ passwordMinLength: 12.5 }, 'passwordMinLength'],
    [{ mfaScope: 'none' }, 'mfaScope'], // MFA cannot be waived for sensitive roles
    [{ mfaScope: null }, 'mfaScope'],
    [{ allowedFactors: [] }, 'allowedFactors'],
    [{ allowedFactors: ['sms'] }, 'allowedFactors'],
    [{ allowedFactors: ['totp', 'totp'] }, 'allowedFactors'],
    [{ maxConcurrentSessions: 0 }, 'maxConcurrentSessions'],
    [{ ipAllowlistDesk: Array.from({ length: 101 }, (_, i) => `10.0.0.${i % 250}`) }, 'ipAllowlistDesk'],
    [{ ipAllowlistApi: 'not-an-array' }, 'ipAllowlistApi'],
    [{ ssoOnly: 'yes' }, 'ssoOnly'],
    [{ breakGlassUserIds: ['not-a-uuid'] }, 'breakGlassUserIds'],
    [{ organizationId: 'someone-else' }, 'organizationId'], // not settable
  ])('rejects %j', async (body, property) => {
    expect(await errorsFor(body)).toContain(property);
  });

  it('accepts stricter-than-floor values and null (= platform default) for session fields', async () => {
    expect(
      await errorsFor({
        sessionIdleMinutes: 15,
        sessionAbsoluteMinutes: null,
        maxConcurrentSessions: null,
        passwordMinLength: 16,
        mfaScope: 'all',
        allowedFactors: ['passkey'],
        ipAllowlistDesk: ['203.0.113.0/24'],
      }),
    ).toEqual([]);
  });
});

describe('SecurityPolicyService', () => {
  let tx: {
    tenantSecurityPolicy: { findUnique: jest.Mock; upsert: jest.Mock };
    identityProvider: { count: jest.Mock };
    user: { count: jest.Mock };
    $executeRaw: jest.Mock;
  };
  let tenantPrisma: { forTenant: jest.Mock };
  let audit: { record: jest.Mock };
  let service: SecurityPolicyService;

  beforeEach(() => {
    tx = {
      tenantSecurityPolicy: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
      identityProvider: { count: jest.fn().mockResolvedValue(1) },
      user: { count: jest.fn().mockResolvedValue(2) },
      $executeRaw: jest.fn(),
    };
    tenantPrisma = { forTenant: jest.fn(async (_c: unknown, fn: (t: unknown) => unknown) => fn(tx)) };
    audit = { record: jest.fn() };
    service = new SecurityPolicyService(tenantPrisma as any, audit as any);
    invalidateTenantSecurityPolicy(ORG);
  });

  const update = (dto: object, caller = ADMIN_CALLER) => service.update(CTX, 'actor-1', dto as UpdateSecurityPolicyDto, caller);

  it('reads the floor-default policy plus the floor when the company has set nothing', async () => {
    expect(await service.get(CTX)).toEqual({ policy: DEFAULT_SECURITY_POLICY, floor: TENANT_SECURITY_FLOOR, updatedAt: null, updatedByUserId: null });
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith(CTX, expect.any(Function));
  });

  it('needs an organisation (platform staff must switch in)', async () => {
    await expect(service.get({ organizationId: null, isSuperAdmin: true })).rejects.toThrow(BadRequestException);
  });

  it('upserts the merged policy, audits exactly what changed, and drops the cached copy', async () => {
    tenantPrisma.forTenant.mockImplementationOnce(async () => null); // warm the cache with "no row"
    await loadTenantSecurityPolicy(tenantPrisma as any, ORG);

    await update({ passwordMinLength: 14, ipAllowlistApi: [' 198.51.100.0/24 ', '198.51.100.0/24'] });

    const upsert = tx.tenantSecurityPolicy.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ organizationId: ORG });
    expect(upsert.update).toEqual(expect.objectContaining({ passwordMinLength: 14, ipAllowlistApi: ['198.51.100.0/24'], updatedByUserId: 'actor-1' }));
    expect(upsert.create).toEqual(expect.objectContaining({ organizationId: ORG, mfaScope: 'sensitive_roles' }));
    expect(audit.record).toHaveBeenCalledWith(CTX, {
      actorUserId: 'actor-1',
      action: 'security_policy.updated',
      entityType: 'organization',
      entityId: ORG,
      metadata: {
        changes: {
          passwordMinLength: { from: 12, to: 14 },
          ipAllowlistApi: { from: [], to: ['198.51.100.0/24'] },
        },
      },
    });
    // The cache was dropped: the next read goes back to the database.
    tx.tenantSecurityPolicy.findUnique.mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, passwordMinLength: 14, organizationId: ORG });
    expect((await loadTenantSecurityPolicy(tenantPrisma as any, ORG)).passwordMinLength).toBe(14);
  });

  it('writes no audit entry when nothing changed', async () => {
    await update({ passwordMinLength: 12 });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('tightens sessions that are already open when session limits change', async () => {
    await update({ sessionIdleMinutes: 10, sessionAbsoluteMinutes: 120 });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const values = tx.$executeRaw.mock.calls[0].slice(1);
    expect(values).toEqual(expect.arrayContaining([600, 7200, ORG]));
  });

  it('leaves open sessions alone when no session limit changed', async () => {
    await update({ mfaScope: 'all' });
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it.each([
    [{ ipAllowlistDesk: ['10.0.0.0/33'] }, 'not an IP address or CIDR range'],
    [{ ipAllowlistAdmin: ['example.com'] }, 'not an IP address or CIDR range'],
    [{ allowedFactors: ['otp'] }, 'one-time codes are a fallback only'],
    [{ sessionIdleMinutes: 300, sessionAbsoluteMinutes: 120 }, 'idle timeout cannot be longer'],
  ])('rejects %j', async (dto, message) => {
    await expect(update(dto)).rejects.toThrow(message);
    expect(tx.tenantSecurityPolicy.upsert).not.toHaveBeenCalled();
  });

  it('refuses a desk or admin list that would lock out the admin saving it', async () => {
    await expect(update({ ipAllowlistDesk: ['198.51.100.0/24'] })).rejects.toThrow('lock you out');
    await expect(update({ ipAllowlistAdmin: ['198.51.100.0/24'] })).rejects.toThrow('lock you out');
    await expect(update({ ipAllowlistDesk: ['203.0.113.0/24'], ipAllowlistAdmin: ['203.0.113.10'] })).resolves.toBeDefined();
  });

  it('lets platform staff (not bound by tenant lists) save a list that excludes them', async () => {
    await expect(update({ ipAllowlistAdmin: ['198.51.100.0/24'] }, { ip: '192.0.2.1', exemptFromIpLists: true })).resolves.toBeDefined();
  });

  describe('SSO-only and break-glass (YX-IAM-04)', () => {
    it('needs at least two break-glass accounts', async () => {
      await expect(update({ ssoOnly: true, breakGlassUserIds: [BG[0]] })).rejects.toThrow('at least 2 break-glass');
    });

    it('needs single sign-on to be set up first', async () => {
      tx.identityProvider.count.mockResolvedValue(0);
      await expect(update({ ssoOnly: true, breakGlassUserIds: BG })).rejects.toThrow('Set up single sign-on');
    });

    it('accepts only active administrators of this organisation as break-glass accounts', async () => {
      tx.user.count.mockResolvedValue(1); // one id is a recruiter, deactivated, or another tenant's user
      await expect(update({ ssoOnly: true, breakGlassUserIds: BG })).rejects.toThrow('active administrators of this organisation');
      expect(tx.user.count).toHaveBeenCalledWith({
        where: { id: { in: BG }, organizationId: ORG, role: 'org_admin', status: 'active' },
      });
    });

    it('turns SSO-only on with two valid break-glass admins', async () => {
      await update({ ssoOnly: true, breakGlassUserIds: BG });
      expect(tx.tenantSecurityPolicy.upsert.mock.calls[0][0].update).toEqual(expect.objectContaining({ ssoOnly: true, breakGlassUserIds: BG }));
    });

    it('cannot drop below two break-glass accounts while SSO-only stays on', async () => {
      tx.tenantSecurityPolicy.findUnique.mockResolvedValue({ ...DEFAULT_SECURITY_POLICY, ssoOnly: true, breakGlassUserIds: BG, organizationId: ORG });
      await expect(update({ breakGlassUserIds: [BG[0]] })).rejects.toThrow('at least 2 break-glass');
    });
  });
});
