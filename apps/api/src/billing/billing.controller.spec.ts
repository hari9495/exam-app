import { BillingController } from './billing.controller';

describe('BillingController', () => {
  const tenant = { organizationId: 'org-1', isSuperAdmin: false };

  it('usage delegates to UsageService with the tenant context', async () => {
    const usage = { getUsage: jest.fn().mockResolvedValue({ planName: 'Trial' }) };
    const controller = new BillingController(usage as any, {} as any);
    await controller.usage(tenant as any);
    expect(usage.getUsage).toHaveBeenCalledWith(tenant);
  });

  it('checkout / portal / plans / invoices delegate to BillingCheckoutService', async () => {
    const checkout = {
      listPurchasablePlans: jest.fn().mockResolvedValue([]),
      createCheckout: jest.fn().mockResolvedValue({ url: 'https://stripe/checkout' }),
      createPortal: jest.fn().mockResolvedValue({ url: 'https://stripe/portal' }),
      listInvoices: jest.fn().mockResolvedValue([]),
    };
    const controller = new BillingController({} as any, checkout as any);
    await controller.plans(tenant as any);
    await controller.createCheckout(tenant as any, 'user-1', { planId: 'plan-1' } as any);
    await controller.createPortal(tenant as any, 'user-1');
    await controller.invoices(tenant as any);
    expect(checkout.listPurchasablePlans).toHaveBeenCalledWith(tenant);
    expect(checkout.createCheckout).toHaveBeenCalledWith(tenant, 'user-1', 'plan-1');
    expect(checkout.createPortal).toHaveBeenCalledWith(tenant, 'user-1');
    expect(checkout.listInvoices).toHaveBeenCalledWith(tenant);
  });
});
