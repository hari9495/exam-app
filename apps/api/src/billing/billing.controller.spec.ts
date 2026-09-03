import { BillingController } from './billing.controller';

describe('BillingController', () => {
  it('usage delegates to UsageService with the tenant context', async () => {
    const usage = { getUsage: jest.fn().mockResolvedValue({ planName: 'Trial' }) };
    const controller = new BillingController(usage as any);
    const tenant = { organizationId: 'org-1', isSuperAdmin: false };
    await controller.usage(tenant as any);
    expect(usage.getUsage).toHaveBeenCalledWith(tenant);
  });
});
