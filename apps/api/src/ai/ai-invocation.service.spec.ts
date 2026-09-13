import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { TenantPrismaService, AiApiKeyResolverService, AiNotConfiguredError } from '@exam-platform/shared';
import { QuotaService } from '../billing/quota.service';
import { AiInvocationService } from './ai-invocation.service';

describe('AiInvocationService', () => {
  let service: AiInvocationService;
  let tenantPrisma: { forTenant: jest.Mock };
  let resolver: { resolve: jest.Mock };
  let quota: { assertWithinLimit: jest.Mock };
  const context = { organizationId: 'org-1', isSuperAdmin: false };
  const provider = { generateStructured: jest.fn(), ping: jest.fn() };
  let usageCreate: jest.Mock;

  beforeEach(async () => {
    usageCreate = jest.fn().mockResolvedValue({});
    tenantPrisma = { forTenant: jest.fn((_c, fn) => fn({ aiCreditUsage: { create: usageCreate } })) };
    resolver = { resolve: jest.fn().mockResolvedValue(provider) };
    quota = { assertWithinLimit: jest.fn().mockResolvedValue(undefined) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AiInvocationService,
        { provide: TenantPrismaService, useValue: tenantPrisma },
        { provide: AiApiKeyResolverService, useValue: resolver },
        { provide: QuotaService, useValue: quota },
      ],
    }).compile();
    service = moduleRef.get(AiInvocationService);
  });

  it('resolves the provider, enforces quota, runs fn, then records usage and returns its result', async () => {
    const fn = jest.fn().mockResolvedValue({ ok: true });
    const out = await service.run(context, { source: 'job_description', sourceId: 'x' }, fn);

    expect(resolver.resolve).toHaveBeenCalledWith('org-1');
    expect(quota.assertWithinLimit).toHaveBeenCalledWith(context, 'ai_credits');
    expect(fn).toHaveBeenCalledWith(provider);
    expect(usageCreate).toHaveBeenCalledWith({ data: { organizationId: 'org-1', source: 'job_description', credits: 1, sourceId: 'x' } });
    expect(out).toEqual({ ok: true });
  });

  it('maps AiNotConfiguredError to BadRequest and never charges or runs fn', async () => {
    resolver.resolve.mockRejectedValue(new AiNotConfiguredError('no key'));
    const fn = jest.fn();
    await expect(service.run(context, { source: 's' }, fn)).rejects.toThrow(BadRequestException);
    expect(quota.assertWithinLimit).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    expect(usageCreate).not.toHaveBeenCalled();
  });

  it('does not run fn or record usage when the quota is exhausted', async () => {
    quota.assertWithinLimit.mockRejectedValue(new Error('quota exceeded'));
    const fn = jest.fn();
    await expect(service.run(context, { source: 's' }, fn)).rejects.toThrow('quota exceeded');
    expect(fn).not.toHaveBeenCalled();
    expect(usageCreate).not.toHaveBeenCalled();
  });

  it('does not record usage when fn throws', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('model failed'));
    await expect(service.run(context, { source: 's' }, fn)).rejects.toThrow('model failed');
    expect(usageCreate).not.toHaveBeenCalled();
  });
});
