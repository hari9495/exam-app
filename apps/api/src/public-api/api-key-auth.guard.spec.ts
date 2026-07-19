import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiKeyAuthGuard } from './api-key-auth.guard';

describe('ApiKeyAuthGuard', () => {
  let guard: ApiKeyAuthGuard;
  let tenantPrisma: { forTenant: jest.Mock };

  beforeEach(() => {
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

  it('attaches request.apiKeyOrg and returns true on a valid key', async () => {
    tenantPrisma.forTenant.mockResolvedValue({ id: 'org-1' });
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
});
