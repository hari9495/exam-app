import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };

  it('usage delegates to UsageService with the tenant context', async () => {
    const usage = { getUsage: jest.fn().mockResolvedValue({ planName: 'Trial' }) };
    const controller = new BillingController(usage as any, {} as any);
    await controller.usage(tenant as any);
    expect(usage.getUsage).toHaveBeenCalledWith(tenant);
  });

  it('invoices delegate to BillingCheckoutService; negative (1971): no checkout, plan picker or portal route', async () => {
    const checkout = { listInvoices: jest.fn().mockResolvedValue([]) };
    const controller = new BillingController({} as any, checkout as any);
    await controller.invoices(tenant as any);
    expect(checkout.listInvoices).toHaveBeenCalledWith(tenant);
    for (const gone of ['createCheckout', 'createPortal', 'plans']) expect((controller as any)[gone]).toBeUndefined();
  });
});
