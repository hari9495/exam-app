import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DEFAULT_SECURITY_POLICY, invalidateTenantSecurityPolicy } from '@exam-platform/shared';
import { ApiKeyAuthGuard, RequireApiScope } from './api-key-auth.guard';

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(() => {
    invalidateTenantSecurityPolicy('org-1');
    tenantPrisma = { forTenant: jest.fn() };
    guard = new ApiKeyAuthGuard(tenantPrisma as any);
  });

  function contextWithHeader(authorization: string | undefined): ExecutionContext {
    const request: any = { headers: authorization !== undefined ? { authorization } : {} };
    return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  }

  it('throws UnauthorizedException when the Authorization header is missing', async () => {
    await expect(guard.canActivate(contextWithHeader(undefined))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when the header is not a Bearer token', async () => {
    await expect(guard.canActivate(contextWithHeader('Basic abc123'))).rejects.toThrow(UnauthorizedException);
  });

  it('throws UnauthorizedException when no organization matches the hash', async () => {
    tenantPrisma.forTenant.mockResolvedValue(null);

    await expect(guard.canActivate(contextWithHeader('Bearer pk_live_wrongkey'))).rejects.toThrow(UnauthorizedException);
    expect(tenantPrisma.forTenant).toHaveBeenCalledWith({ organizationId: null, isSuperAdmin: true }, expect.any(Function));
  });

  it('uses the same rejection message for a malformed header and a non-matching key', async () => {
    tenantPrisma.forTenant.mockResolvedValue(null);

    let malformedMessage: string | undefined;
    let noMatchMessage: string | undefined;
    try {
      await guard.canActivate(contextWithHeader('Basic abc123'));
    } catch (err) {
      malformedMessage = (err as UnauthorizedException).message;
    }
    try {
      await guard.canActivate(contextWithHeader('Bearer pk_live_wrongkey'));
    } catch (err) {
      noMatchMessage = (err as UnauthorizedException).message;
    }

    expect(malformedMessage).toBeDefined();
    expect(malformedMessage).toBe(noMatchMessage);
  });

  it('attaches request.apiKeyOrg and returns true on a valid key', async () => {
    tenantPrisma.forTenant.mockResolvedValueOnce({ id: 'org-1' }).mockResolvedValueOnce(null); // key's org, then no policy row
    const request: any = { headers: { authorization: 'Bearer pk_live_realkey' } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(request.apiKeyOrg).toEqual({ organizationId: 'org-1' });
  });

  it('hashes the provided key with SHA-256 before querying', async () => {
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) => fn({ organization: { findFirst: jest.fn().mockResolvedValue(null) } }));
    const expectedHash = createHash('sha256').update('pk_live_realkey').digest('hex');
    const captured: { where?: { apiKeyHash: string } } = {};
    tenantPrisma.forTenant.mockImplementation((_ctx, fn) =>
      fn({ organization: { findFirst: (args: { where: { apiKeyHash: string } }) => { Object.assign(captured, args); return Promise.resolve(null); } } }),
    );

    await expect(guard.canActivate(contextWithHeader('Bearer pk_live_realkey'))).rejects.toThrow(UnauthorizedException);
    expect(captured.where?.apiKeyHash).toBe(expectedHash);
  });

  describe("the company's API IP allow-list (YX-IAM-09)", () => {
    const withList = (ip: string) => {
      tenantPrisma.forTenant
        .mockResolvedValueOnce({ id: 'org-1' })
        .mockResolvedValueOnce({ ...DEFAULT_SECURITY_POLICY, ipAllowlistApi: ['203.0.113.0/24'], organizationId: 'org-1' });
      const request: any = { ip, headers: { authorization: 'Bearer pk_live_realkey' } };
      return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext };
    };

    it('accepts a valid key from an allowed address', async () => {
      const { request, context } = withList('203.0.113.10');
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(request.apiKeyOrg).toEqual({ organizationId: 'org-1' });
    });

    it('refuses a valid key from any other address with 403 and attaches nothing', async () => {
      const { request, context } = withList('192.0.2.10');
      await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
      expect(request.apiKeyOrg).toBeUndefined();
    });

    it('never reaches the policy for an unknown key, so the refusal cannot be probed without a key', async () => {
      tenantPrisma.forTenant.mockResolvedValue(null);
      await expect(guard.canActivate(contextWithHeader('Bearer pk_live_wrongkey'))).rejects.toThrow(UnauthorizedException);
      expect(tenantPrisma.forTenant).toHaveBeenCalledTimes(1);
    });
  });

  describe('the payroll-write scope (P11 YX-API-12)', () => {
    class Routes {
      @RequireApiScope('payroll-write')
      write() {}
    }
    const ctx = (scopes: string[]) => {
      tenantPrisma.forTenant.mockResolvedValueOnce({ id: 'org-1', apiKeyScopes: scopes }).mockResolvedValueOnce({ ...DEFAULT_SECURITY_POLICY, organizationId: 'org-1' });
      const request: any = { ip: '203.0.113.10', headers: { authorization: 'Bearer pk_live_realkey' } };
      return { request, context: { switchToHttp: () => ({ getRequest: () => request }), getHandler: () => Routes.prototype.write } as unknown as ExecutionContext };
    };

    it('refuses a payroll write with a key that lacks the scope', async () => {
      const { request, context } = ctx([]);
      await expect(guard.canActivate(context)).rejects.toThrow(/payroll-write/);
      expect(request.apiKeyOrg).toBeUndefined();
    });

    it('lets a key with the scope through', async () => {
      const { context } = ctx(['payroll-write']);
      await expect(guard.canActivate(context)).resolves.toBe(true);
    });
  });
});
