import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PublicApiThrottlerGuard } from './public-api-throttler.guard';
import { ApiUsageService } from '../api-usage/api-usage.service';

describe('PublicApiThrottlerGuard', () => {
  function makeGuard(apiUsage: ApiUsageService) {
    // Base ThrottlerGuard deps are irrelevant to the behavior under test (getTracker /
    // throwThrottlingException don't touch options or storage), so minimal stand-ins suffice.
    return new PublicApiThrottlerGuard({} as any, {} as any, new Reflector(), apiUsage);
  }

  describe('getTracker', () => {
    it('keys by apiKeyOrg.organizationId when present', async () => {
      const guard = makeGuard({ record: jest.fn() } as unknown as ApiUsageService);
      const tracker = await (guard as any).getTracker({ apiKeyOrg: { organizationId: 'org-1' }, ip: '1.2.3.4' });
      expect(tracker).toBe('org-1');
    });

    it('falls back to req.ip when apiKeyOrg is absent', async () => {
      const guard = makeGuard({ record: jest.fn() } as unknown as ApiUsageService);
      const tracker = await (guard as any).getTracker({ ip: '1.2.3.4' });
      expect(tracker).toBe('1.2.3.4');
    });
  });

  describe('throwThrottlingException', () => {
    it('records a throttled usage event and still throws the 429', async () => {
      const record = jest.fn().mockResolvedValue(undefined);
      const guard = makeGuard({ record } as unknown as ApiUsageService);
      const request = { apiKeyOrg: { organizationId: 'org-1' }, method: 'GET', route: { path: '/public/candidates' } };
      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext;

      await expect((guard as any).throwThrottlingException(context, {})).rejects.toThrow();

      expect(record).toHaveBeenCalledTimes(1);
      expect(record).toHaveBeenCalledWith({ organizationId: 'org-1', isSuperAdmin: false }, 'GET /public/candidates', 'throttled');
    });
  });
});
